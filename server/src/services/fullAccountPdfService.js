import PDFDocument from "pdfkit";
import { supabaseAdmin } from "../config/supabase.js";

/* =========================================
   HELPERS
========================================= */

function money(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function safeText(value) {
  return String(value || "").trim();
}

function eventDate(item) {
  return (
    item.date ||
    item.created_at ||
    new Date().toISOString()
  );
}

function sortEvents(a, b) {
  return new Date(eventDate(a)) - new Date(eventDate(b));
}

/* =========================================
   LOAD FULL CUSTOMER ACCOUNT
========================================= */

export async function getFullAccountHistory(customerId) {
  const [
    customerResult,
    paymentResult,
    balanceResult,
  ] = await Promise.all([
    supabaseAdmin
      .from("customers")
      .select("*")
      .eq("id", customerId)
      .single(),

    supabaseAdmin
      .from("payments")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", {
        ascending: true,
      }),

    supabaseAdmin
      .from("debtor_balance_records")
      .select("*")
      .eq("customer_id", customerId)
      .order("created_at", {
        ascending: true,
      }),
  ]);

  if (
    customerResult.error ||
    !customerResult.data
  ) {
    throw new Error(
      customerResult.error?.message ||
        "Customer not found."
    );
  }

  if (paymentResult.error) {
    throw new Error(
      paymentResult.error.message
    );
  }

  if (balanceResult.error) {
    throw new Error(
      balanceResult.error.message
    );
  }

  const customer =
    customerResult.data;

  const payments =
    paymentResult.data || [];

  const balances =
    balanceResult.data || [];

  /* =========================================
     BUILD ONE TIMELINE
  ========================================= */

  const events = [];

  for (const balance of balances) {
    events.push({
      id: balance.id,

      kind: "debt",

      amount: Number(
        balance.amount || 0
      ),

      date:
        balance.record_date ||
        balance.created_at,

      shamsi:
        balance.date_shamsi ||
        "",

      created_at:
        balance.created_at,

      type:
        balance.type,

      bill_number:
        balance.bill_number,

      note:
        balance.note,

      original:
        balance,
    });
  }

  for (const payment of payments) {
    events.push({
      id: payment.id,

      kind: "payment",

      amount: Number(
        payment.amount || 0
      ),

      date:
        payment.payment_date ||
        payment.created_at,

      shamsi:
        payment.payment_date_shamsi ||
        "",

      created_at:
        payment.created_at,

      method:
        payment.method,

      hawala_number:
        payment.hawala_number,

      market:
        payment.market,

      note:
        payment.notes,

      original:
        payment,
    });
  }

  events.sort(sortEvents);

  /* =========================================
     TOTALS
  ========================================= */

  const totalDebt =
    balances.reduce(
      (sum, item) =>
        sum +
        Number(item.amount || 0),
      0
    );

  const totalPaid =
    payments.reduce(
      (sum, item) =>
        sum +
        Number(item.amount || 0),
      0
    );

  const currentBalance =
    Number(
      customer.current_balance || 0
    );

  /*
    There may be an opening balance which
    existed before debtor_balance_records
    started being used.

    We derive it from the authoritative
    current balance:
    
    current =
      opening + debts - payments
  */

  const openingBalance =
    currentBalance -
    totalDebt +
    totalPaid;

  /* =========================================
     RUNNING BALANCE
  ========================================= */

  let runningBalance =
    openingBalance;

  const timeline = [];

  if (openingBalance !== 0) {
    timeline.push({
      kind: "opening",
      date:
        customer.created_at ||
        events[0]?.date ||
        new Date().toISOString(),

      shamsi: "",

      description:
        "Opening Balance",

      debit:
        openingBalance > 0
          ? openingBalance
          : 0,

      credit:
        openingBalance < 0
          ? Math.abs(
              openingBalance
            )
          : 0,

      balance:
        openingBalance,
    });
  }

  for (const event of events) {
    if (event.kind === "debt") {
      runningBalance +=
        event.amount;

      let description =
        "New Balance";

      if (
        event.type ===
        "goods_credit"
      ) {
        description =
          "Goods Credit";
      }

      if (
        event.type ===
        "bill_transfer"
      ) {
        description =
          "Bill Transfer";
      }

      if (event.bill_number) {
        description +=
          ` #${event.bill_number}`;
      }

      timeline.push({
        ...event,

        description,

        debit:
          event.amount,

        credit: 0,

        balance:
          runningBalance,
      });
    }

    if (
      event.kind ===
      "payment"
    ) {
      runningBalance -=
        event.amount;

      let description =
        event.method ===
        "hawala"
          ? "Hawala Payment"
          : "Cash Payment";

      if (
        event.hawala_number
      ) {
        description +=
          ` #${event.hawala_number}`;
      }

      timeline.push({
        ...event,

        description,

        debit: 0,

        credit:
          event.amount,

        balance:
          runningBalance,
      });
    }
  }

  return {
    customer,

    payments,

    balances,

    timeline,

    openingBalance,

    totalDebt:
      openingBalance +
      totalDebt,

    addedDebt:
      totalDebt,

    totalPaid,

    calculatedBalance:
      runningBalance,

    currentBalance,
  };
}

/* =========================================
   CREATE PDF
========================================= */

export async function createFullAccountPdf(
  customerId
) {
  const account =
    await getFullAccountHistory(
      customerId
    );

  const {
    customer,
    timeline,
    openingBalance,
    totalDebt,
    addedDebt,
    totalPaid,
    currentBalance,
  } = account;

  const currency =
    customer.currency === "USD"
      ? "USD"
      : "AFN";

  return new Promise(
    (resolve, reject) => {
      try {
        const doc =
          new PDFDocument({
            size: "A4",

            margins: {
              top: 40,
              bottom: 45,
              left: 35,
              right: 35,
            },

            bufferPages: true,
          });

        const chunks = [];

        doc.on(
          "data",
          (chunk) => {
            chunks.push(chunk);
          }
        );

        doc.on(
          "end",
          () => {
            resolve(
              Buffer.concat(chunks)
            );
          }
        );

        doc.on(
          "error",
          reject
        );

        /* ===============================
           HEADER
        =============================== */

        doc
          .font("Helvetica-Bold")
          .fontSize(19)
          .text(
            "NIAZI STORE",
            {
              align: "center",
            }
          );

        doc
          .moveDown(0.2)
          .fontSize(14)
          .text(
            "FULL ACCOUNT STATEMENT",
            {
              align: "center",
            }
          );

        doc
          .moveDown(0.4)
          .font("Helvetica")
          .fontSize(9)
          .text(
            `Generated: ${new Date().toLocaleString(
              "en-GB"
            )}`,
            {
              align: "center",
            }
          );

        doc.moveDown(1);

        doc
          .moveTo(
            35,
            doc.y
          )
          .lineTo(
            560,
            doc.y
          )
          .stroke();

        doc.moveDown(1);

        /* ===============================
           CUSTOMER
        =============================== */

        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .text(
            `Customer: ${safeText(
              customer.name
            ) || "-"}`
          );

        doc
          .font("Helvetica")
          .text(
            `Phone: ${safeText(
              customer.phone
            ) || "-"}`
          );

        doc.text(
          `Currency: ${currency}`
        );

        if (
          customer.address
        ) {
          doc.text(
            `Address: ${safeText(
              customer.address
            )}`
          );
        }

        doc.moveDown(1);

        /* ===============================
           SUMMARY
        =============================== */

        doc
          .font("Helvetica-Bold")
          .fontSize(12)
          .text(
            "ACCOUNT SUMMARY"
          );

        doc.moveDown(0.4);

        doc
          .font("Helvetica")
          .fontSize(10);

        doc.text(
          `Opening Balance: ${money(
            openingBalance
          )} ${currency}`
        );

        doc.text(
          `New Debt / Balance Records: ${money(
            addedDebt
          )} ${currency}`
        );

        doc.text(
          `Total Account: ${money(
            totalDebt
          )} ${currency}`
        );

        doc.text(
          `Total Received: ${money(
            totalPaid
          )} ${currency}`
        );

        doc
          .font("Helvetica-Bold")
          .text(
            `FINAL BALANCE: ${money(
              currentBalance
            )} ${currency}`
          );

        doc.moveDown(1);

        /* ===============================
           TABLE HEADER
        =============================== */

        const columns = {
          no: 35,
          date: 58,
          description: 137,
          debt: 310,
          payment: 390,
          balance: 475,
        };

        function tableHeader() {
          if (
            doc.y > 720
          ) {
            doc.addPage();
          }

          const y =
            doc.y;

          doc
            .font(
              "Helvetica-Bold"
            )
            .fontSize(8);

          doc.text(
            "#",
            columns.no,
            y,
            {
              width: 20,
            }
          );

          doc.text(
            "Date",
            columns.date,
            y,
            {
              width: 75,
            }
          );

          doc.text(
            "Description",
            columns.description,
            y,
            {
              width: 165,
            }
          );

          doc.text(
            "Debt",
            columns.debt,
            y,
            {
              width: 75,
              align: "right",
            }
          );

          doc.text(
            "Received",
            columns.payment,
            y,
            {
              width: 80,
              align: "right",
            }
          );

          doc.text(
            "Balance",
            columns.balance,
            y,
            {
              width: 80,
              align: "right",
            }
          );

          doc.y =
            y + 16;

          doc
            .moveTo(
              35,
              doc.y
            )
            .lineTo(
              560,
              doc.y
            )
            .stroke();

          doc.y += 5;
        }

        tableHeader();

        /* ===============================
           TRANSACTIONS
        =============================== */

        if (
          !timeline.length
        ) {
          doc
            .font(
              "Helvetica"
            )
            .fontSize(10)
            .text(
              "No account transactions found."
            );
        }

        timeline.forEach(
          (
            item,
            index
          ) => {
            if (
              doc.y > 735
            ) {
              doc.addPage();

              tableHeader();
            }

            const y =
              doc.y;

            const date =
              item.shamsi ||
              safeText(
                item.date
              ).slice(
                0,
                10
              ) ||
              "-";

            doc
              .font(
                "Helvetica"
              )
              .fontSize(7.5);

            doc.text(
              String(
                index + 1
              ),
              columns.no,
              y,
              {
                width: 20,
              }
            );

            doc.text(
              date,
              columns.date,
              y,
              {
                width: 75,
              }
            );

            doc.text(
              item.description ||
                "-",
              columns.description,
              y,
              {
                width: 165,
              }
            );

            doc.text(
              item.debit
                ? money(
                    item.debit
                  )
                : "-",
              columns.debt,
              y,
              {
                width: 75,
                align:
                  "right",
              }
            );

            doc.text(
              item.credit
                ? money(
                    item.credit
                  )
                : "-",
              columns.payment,
              y,
              {
                width: 80,
                align:
                  "right",
              }
            );

            doc.text(
              money(
                item.balance
              ),
              columns.balance,
              y,
              {
                width: 80,
                align:
                  "right",
              }
            );

            doc.y =
              y + 18;

            doc
              .moveTo(
                35,
                doc.y
              )
              .lineTo(
                560,
                doc.y
              )
              .strokeOpacity(
                0.15
              )
              .stroke();

            doc.strokeOpacity(
              1
            );

            doc.y += 4;
          }
        );

        /* ===============================
           FINAL TOTAL
        =============================== */

        if (
          doc.y > 690
        ) {
          doc.addPage();
        }

        doc.moveDown(1);

        doc
          .font(
            "Helvetica-Bold"
          )
          .fontSize(11)
          .text(
            `TOTAL ACCOUNT: ${money(
              totalDebt
            )} ${currency}`,
            {
              align: "right",
            }
          );

        doc.text(
          `TOTAL RECEIVED: ${money(
            totalPaid
          )} ${currency}`,
          {
            align: "right",
          }
        );

        doc
          .fontSize(13)
          .text(
            `FINAL BALANCE: ${money(
              currentBalance
            )} ${currency}`,
            {
              align: "right",
            }
          );

        /* ===============================
           PAGE NUMBERS
        =============================== */

        const range =
          doc.bufferedPageRange();

        for (
          let i = 0;
          i <
          range.count;
          i += 1
        ) {
          doc.switchToPage(
            i
          );

          doc
            .font(
              "Helvetica"
            )
            .fontSize(8)
            .text(
              `Page ${
                i + 1
              } of ${
                range.count
              }`,
              35,
              805,
              {
                width: 525,
                align:
                  "center",
              }
            );
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    }
  );
}