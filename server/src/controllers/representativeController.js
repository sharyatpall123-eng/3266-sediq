import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../config/supabase.js";
import { ApiError, asyncHandler, sendData } from "../utils/http.js";

const clean = (body) => ({
  name: String(body.name || "").trim(),
  phone: String(body.phone || "").trim() || null,
  address: String(body.address || "").trim() || null,
  contact_person: String(body.contact_person || "").trim() || null,
  notes: String(body.notes || "").trim() || null,
  opening_balance: Math.max(0, Number(body.opening_balance || 0)),
  opening_balance_note: String(body.opening_balance_note || "").trim() || null,
  account_currency: "USD",
});

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const deliveryBalance = (row) =>
  Math.max(0, Number(row.quantity || 0) - Number(row.delivered_quantity || 0));

function deliveryRent(row) {
  const rentType = row?.rent_type === "ton" ? "ton" : "cbm";
  const weightKg = Math.max(0, Number(row?.weight_kg || row?.weight || 0));
  const cbm = Math.max(0, Number(row?.cbm || 0));
  const rate = Math.max(0, Number(row?.rent_rate || 0));
  const storedAmount = Math.max(0, Number(row?.rent_amount || row?.freight || 0));
  const base = rentType === "ton" ? weightKg / 1000 : cbm;
  const amount = storedAmount > 0 ? storedAmount : roundMoney(base * rate);
  return { rentType, rate, amount };
}

function normalizeDeliveryEvents(row) {
  const totalQuantity = Math.max(0, Number(row?.quantity || 0));
  const deliveredTotal = Math.min(
    totalQuantity,
    Math.max(0, Number(row?.delivered_quantity || 0)),
  );
  if (deliveredTotal <= 0) return [];

  const source = Array.isArray(row?.delivery_history) ? row.delivery_history : [];
  const events = [];
  let used = 0;

  for (const event of source) {
    if (used >= deliveredTotal) break;
    const rawQuantity = Math.max(0, Number(event?.quantity || 0));
    const quantity = Math.min(rawQuantity, deliveredTotal - used);
    if (quantity <= 0) continue;
    events.push({
      id: event.id || randomUUID(),
      quantity,
      date:
        event.date ||
        event.delivery_date ||
        row.last_delivered_at?.slice?.(0, 10) ||
        row.delivery_date ||
        row.created_at?.slice?.(0, 10) ||
        new Date().toISOString().slice(0, 10),
      created_at: event.created_at || row.updated_at || row.created_at || new Date().toISOString(),
      notes: event.notes || "",
    });
    used += quantity;
  }

  if (used < deliveredTotal) {
    events.push({
      id: `legacy-${row.id}`,
      quantity: deliveredTotal - used,
      date:
        row.last_delivered_at?.slice?.(0, 10) ||
        row.delivery_date ||
        row.created_at?.slice?.(0, 10) ||
        new Date().toISOString().slice(0, 10),
      created_at: row.updated_at || row.created_at || new Date().toISOString(),
      notes: "",
    });
  }

  return events;
}

function buildAccountData(representative, deliveries, receipts) {
  const openingBalance = roundMoney(
    Math.max(0, Number(representative?.opening_balance || 0)),
  );

  const openingCharge =
    openingBalance > 0
      ? {
          id: `opening-${representative.id}`,
          type: "opening_balance",
          delivery_id: null,
          event_id: null,
          date:
            representative.created_at?.slice?.(0, 10) ||
            new Date().toISOString().slice(0, 10),
          created_at: representative.created_at || new Date().toISOString(),
          amount: openingBalance,
          quantity: 0,
          delivered_quantity: 0,
          goods_name: "پخوانی باقي",
          details: String(representative?.opening_balance_note || ""),
          shop_address: "",
          location: "",
          rent_type: "",
          rent_rate: 0,
          total_freight: openingBalance,
          unit_freight: 0,
          currency: "USD",
        }
      : null;

  /*
   * مهم حساب:
   * د شرکت حساب اوس د ټولو ثبت شوو مالونو د اوسني کرایې پر اساس دی،
   * نه یوازې د تسلیم شوي مقدار پر اساس.
   *
   * CBM/KG/Rate چې Edit شي، updateDelivery نوی rent_amount ذخیره کوي.
   * دا function هر ځل له Supabase څخه نوی delivery اخلي، نو حساب هم
   * په اتومات جمع یا منفي کېږي.
   */
  const deliveryCharges = (deliveries || [])
    .map((row) => {
      const rent = deliveryRent(row);
      const quantity = Math.max(0, Number(row.quantity || 0));
      // Only explicit manual delivery events create freight debt.
      // A legacy/non-explicit delivered_quantity value must never create a charge by itself.
      const explicitDelivered = (Array.isArray(row.delivery_history) ? row.delivery_history : [])
        .reduce((sum, event) => sum + Math.max(0, Number(event?.quantity || 0)), 0);
      const deliveredQuantity = Math.min(quantity, explicitDelivered);

      return {
        id: `charge-${row.id}`,
        type: "charge",
        delivery_id: row.id,
        event_id: null,
        date:
          row.delivery_date ||
          row.created_at?.slice?.(0, 10) ||
          new Date().toISOString().slice(0, 10),
        created_at: row.updated_at || row.created_at || new Date().toISOString(),
        amount: roundMoney(quantity > 0 ? rent.amount * (deliveredQuantity / quantity) : 0),
        quantity,
        delivered_quantity: deliveredQuantity,
        goods_name: String(row.description || "بې نومه جنس"),
        details: String(row.details || ""),
        shop_address: String(row.shop_address || ""),
        location: String(row.location || ""),
        rent_type: rent.rentType,
        rent_rate: rent.rate,
        total_freight: roundMoney(quantity > 0 ? rent.amount * (deliveredQuantity / quantity) : 0),
        unit_freight: quantity > 0 ? roundMoney(rent.amount / quantity) : 0,
        currency: "USD",
      };
    })
    .filter((entry) => entry.amount > 0);

  const charges = openingCharge
    ? [openingCharge, ...deliveryCharges]
    : deliveryCharges;

  const normalizedReceipts = (receipts || [])
    .map((receipt) => ({
      ...receipt,
      type: "receipt",
      amount: Math.max(0, Number(receipt.amount || 0)),
      date:
        receipt.date ||
        receipt.payment_date ||
        receipt.created_at?.slice?.(0, 10) ||
        new Date().toISOString().slice(0, 10),
      receipt_number: String(receipt.receipt_number || "").trim(),
      currency: "USD",
    }))
    .sort(
      (a, b) =>
        new Date(b.created_at || b.date).getTime() -
        new Date(a.created_at || a.date).getTime(),
    );

  const totalAccount = roundMoney(
    charges.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const totalReceipts = roundMoney(
    normalizedReceipts.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
  );
  const remaining = roundMoney(Math.max(0, totalAccount - totalReceipts));

  const deliveredCartons = (deliveries || []).reduce(
    (sum, row) =>
      sum +
      (Array.isArray(row.delivery_history) ? row.delivery_history : []).reduce(
        (eventSum, event) => eventSum + Math.max(0, Number(event?.quantity || 0)),
        0,
      ),
    0,
  );

  const chronological = [
    ...charges.map((entry) => ({
      ...entry,
      debit: entry.amount,
      credit: 0,
      description:
        entry.type === "opening_balance"
          ? `پخوانی باقي${entry.details ? ` — ${entry.details}` : ""}`
          : `د مال کرایه — ${entry.goods_name}${entry.details ? ` — ${entry.details}` : ""}`,
    })),
    ...normalizedReceipts.map((entry) => ({
      ...entry,
      debit: 0,
      credit: entry.amount,
      description: `وصولي — رسید نمبر: ${entry.receipt_number}`,
    })),
  ].sort((a, b) => {
    const dateDiff =
      new Date(a.created_at || a.date).getTime() -
      new Date(b.created_at || b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return a.type === "receipt" ? 1 : -1;
  });

  let runningBalance = 0;
  const ledger = chronological.map((entry) => {
    runningBalance = roundMoney(
      Math.max(
        0,
        runningBalance + Number(entry.debit || 0) - Number(entry.credit || 0),
      ),
    );
    return { ...entry, running_balance: runningBalance };
  });

  return {
    representative: {
      ...representative,
      account_currency: "USD",
      account_balance: remaining,
      remaining_account: remaining,
    },
    currency: "USD",
    charges: charges.sort(
      (a, b) =>
        new Date(b.created_at || b.date).getTime() -
        new Date(a.created_at || a.date).getTime(),
    ),
    receipts: normalizedReceipts,
    ledger,
    summary: {
      opening_balance: openingBalance,
      total_account: totalAccount,
      total_receipts: totalReceipts,
      remaining,
      delivered_cartons: deliveredCartons,
    },
  };
}

async function loadRepresentative(id) {
  const [{ data: representative, error }, { data: deliveries }, { data: receipts }] =
    await Promise.all([
      supabaseAdmin.from("representatives").select("*").eq("id", id).single(),
      supabaseAdmin
        .from("representative_deliveries")
        .select("*")
        .eq("representative_id", id)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("representative_receipts")
        .select("*")
        .eq("representative_id", id)
        .order("payment_date", { ascending: false }),
    ]);

  if (error || !representative) throw new ApiError(404, "استازی پیدا نه شو.");

  const rows = deliveries || [];
  const receiptRows = receipts || [];
  const totalGoods = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const deliveredGoods = rows.reduce(
    (sum, row) => sum + Number(row.delivered_quantity || 0),
    0,
  );
  const totalAmount = rows.reduce(
    (sum, row) => sum + Number(row.price || 0) + Number(row.rent_amount || 0),
    0,
  );

  const baseRepresentative = {
    ...representative,
    total_goods: totalGoods,
    delivered_goods: deliveredGoods,
    remaining_goods: Math.max(0, totalGoods - deliveredGoods),
    total_amount: totalAmount,
    deliveries: rows,
    account_receipts: receiptRows,
  };

  const account = buildAccountData(baseRepresentative, rows, receiptRows);

  return {
    representative: account.representative,
    deliveries: rows,
    receipts: receiptRows,
    totalAmount,
    received: account.summary.total_receipts,
    accountTotal: account.summary.total_account,
    account,
  };
}

export const listRepresentatives = asyncHandler(async (request, response) => {
  const search = String(request.query.search || "").trim();
  const limit = Math.min(500, Math.max(1, Number(request.query.limit || 100)));

  let query = supabaseAdmin
    .from("representatives")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new ApiError(400, error.message);

  const representatives = data || [];
  if (!representatives.length) {
    return sendData(response, [], "Representatives loaded", 200, { total: 0 });
  }

  const ids = representatives.map((row) => row.id);
  const [deliveriesResult, receiptsResult] = await Promise.all([
    supabaseAdmin
      .from("representative_deliveries")
      .select("*")
      .in("representative_id", ids)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("representative_receipts")
      .select("*")
      .in("representative_id", ids)
      .order("payment_date", { ascending: false }),
  ]);

  if (deliveriesResult.error) throw new ApiError(400, deliveriesResult.error.message);
  if (receiptsResult.error) throw new ApiError(400, receiptsResult.error.message);

  const deliveriesByRepresentative = new Map();
  for (const row of deliveriesResult.data || []) {
    if (!deliveriesByRepresentative.has(row.representative_id)) {
      deliveriesByRepresentative.set(row.representative_id, []);
    }
    deliveriesByRepresentative.get(row.representative_id).push(row);
  }

  const receiptsByRepresentative = new Map();
  for (const row of receiptsResult.data || []) {
    if (!receiptsByRepresentative.has(row.representative_id)) {
      receiptsByRepresentative.set(row.representative_id, []);
    }
    receiptsByRepresentative.get(row.representative_id).push(row);
  }

  const rows = representatives.map((representative) => {
    const deliveries = deliveriesByRepresentative.get(representative.id) || [];
    const receipts = receiptsByRepresentative.get(representative.id) || [];
    const totalGoods = deliveries.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const deliveredGoods = deliveries.reduce(
      (sum, row) => sum + Number(row.delivered_quantity || 0),
      0,
    );
    const totalAmount = deliveries.reduce(
      (sum, row) => sum + Number(row.price || 0) + Number(row.rent_amount || 0),
      0,
    );

    const baseRepresentative = {
      ...representative,
      total_goods: totalGoods,
      delivered_goods: deliveredGoods,
      remaining_goods: Math.max(0, totalGoods - deliveredGoods),
      total_amount: totalAmount,
      deliveries,
      account_receipts: receipts,
    };

    return buildAccountData(baseRepresentative, deliveries, receipts).representative;
  });

  return sendData(response, rows, "Representatives loaded", 200, { total: rows.length });
});

export const getRepresentative = asyncHandler(async (request, response) =>
  sendData(response, await loadRepresentative(request.params.id)),
);

export const getDelivery = asyncHandler(async (request, response) => {
  const loaded = await loadRepresentative(request.params.id);
  const delivery = loaded.deliveries.find((row) => row.id === request.params.deliveryId);
  if (!delivery) throw new ApiError(404, "د مال ریکارډ پیدا نه شو.");
  return sendData(response, { representative: loaded.representative, delivery });
});

export const getAccount = asyncHandler(async (request, response) => {
  const loaded = await loadRepresentative(request.params.id);
  return sendData(response, loaded.account);
});

export const createRepresentative = asyncHandler(async (request, response) => {
  const payload = clean(request.body);
  if (!payload.name) {
    throw new ApiError(400, "د استازي نوم ضروري دی.");
  }
  const { data, error } = await supabaseAdmin
    .from("representatives")
    .insert({ ...payload, created_by: request.auth.user.id })
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Representative created", 201);
});

export const updateRepresentative = asyncHandler(async (request, response) => {
  const payload = clean(request.body);
  if (!payload.name) delete payload.name;

  if (!Object.prototype.hasOwnProperty.call(request.body, "opening_balance")) {
    delete payload.opening_balance;
  }
  if (!Object.prototype.hasOwnProperty.call(request.body, "opening_balance_note")) {
    delete payload.opening_balance_note;
  }

  payload.account_currency = "USD";

  const { data, error } = await supabaseAdmin
    .from("representatives")
    .update(payload)
    .eq("id", request.params.id)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  return sendData(response, data, "Representative updated");
});

export const deleteRepresentative = asyncHandler(async (request, response) => {
  // Load the full representative state first so deletion rules use
  // the real remaining goods and the real USD account balance.
  const loaded = await loadRepresentative(request.params.id);
  const representative = loaded.representative;

  const remainingGoods = Math.max(
    0,
    Number(representative?.remaining_goods || 0),
  );
  const remainingAccount = Math.max(
    0,
    Number(
      representative?.remaining_account ??
        representative?.account_balance ??
        loaded?.account?.summary?.remaining ??
        0,
    ),
  );

  // A representative with goods still in transit must never be deleted.
  if (remainingGoods > 0) {
    throw new ApiError(
      400,
      `دا استازی لا ${remainingGoods} مال په لاره کې لري، تر بشپړ تسلیمېدو مخکې حذف کېدای نشي.`,
    );
  }

  // A representative with an unpaid account must never be deleted.
  if (remainingAccount > 0.01) {
    throw new ApiError(
      400,
      `دا استازی لا $${roundMoney(remainingAccount)} باقي حساب لري، تر حساب تصفیې مخکې حذف کېدای نشي.`,
    );
  }

  const { data: row, error: findError } = await supabaseAdmin
    .from("representatives")
    .select("*")
    .eq("id", request.params.id)
    .single();

  if (findError || !row) {
    throw new ApiError(404, "استازی پیدا نه شو.");
  }

  /*
   * IMPORTANT:
   * recycle_bin schema requires:
   * - entity_type
   * - entity_id
   * - original_table
   * - data
   * - deleted_by as UUID
   *
   * Do not use label here and do not send deleted_by as an object.
   */
  const { data: recycleRow, error: recycleError } = await supabaseAdmin
    .from("recycle_bin")
    .insert({
      entity_type: "representative",
      entity_id: String(row.id),
      original_table: "representatives",
      data: {
        ...row,
        recycle_label: row.name,
      },
      deleted_by: request.auth?.user?.id || null,
    })
    .select("id")
    .single();

  // If Recycle Bin insert fails, DO NOT hide/delete the representative.
  if (recycleError || !recycleRow) {
    throw new ApiError(
      400,
      `Recycle Bin ته انتقال ناکام شو: ${recycleError?.message || "نامعلومه ستونزه"}`,
    );
  }

  const { data, error } = await supabaseAdmin
    .from("representatives")
    .update({ is_active: false })
    .eq("id", request.params.id)
    .select("id")
    .single();

  if (error) {
    // Roll back the recycle record if deactivation fails,
    // so we do not leave an incorrect duplicate in Recycle Bin.
    await supabaseAdmin
      .from("recycle_bin")
      .delete()
      .eq("id", recycleRow.id);

    throw new ApiError(400, error.message);
  }

  return sendData(
    response,
    {
      ...data,
      recycle_bin_id: recycleRow.id,
    },
    "Representative moved to Recycle Bin",
  );
});

export const addReceipt = asyncHandler(async (request, response) => {
  const amount = Number(request.body.amount || 0);
  const receiptNumber = String(request.body.receipt_number || "").trim();
  const paymentDate =
    request.body.date ||
    request.body.payment_date ||
    new Date().toISOString().slice(0, 10);
  if (amount <= 0 || !receiptNumber) {
    throw new ApiError(400, "وصولي او رسید نمبر ضروري دي.");
  }

  const loaded = await loadRepresentative(request.params.id);
  const remaining = Math.max(0, loaded.accountTotal - loaded.received);
  if (amount > remaining + 0.01) {
    throw new ApiError(400, "وصولي د شرکت له موجوده باقي څخه زیاته ده.");
  }

  const { error } = await supabaseAdmin.from("representative_receipts").insert({
    representative_id: request.params.id,
    receipt_number: receiptNumber,
    amount,
    payment_date: paymentDate,
    notes: request.body.notes || null,
    created_by: request.auth.user.id,
  });
  if (error) throw new ApiError(400, error.message);

  const next = await loadRepresentative(request.params.id);
  return sendData(response, next.account, "Receipt added", 201);
});

export const updateReceipt = asyncHandler(async (request, response) => {
  const { id: representativeId, receiptId } = request.params;
  const amount = Number(request.body.amount || 0);
  const receiptNumber = String(request.body.receipt_number || "").trim();
  const paymentDate =
    request.body.date ||
    request.body.payment_date ||
    new Date().toISOString().slice(0, 10);

  if (amount <= 0 || !receiptNumber) {
    throw new ApiError(400, "وصولي، تاریخ او رسید نمبر ضروري دي.");
  }

  const [{ data: oldReceipt, error: receiptError }, loaded] = await Promise.all([
    supabaseAdmin
      .from("representative_receipts")
      .select("*")
      .eq("id", receiptId)
      .eq("representative_id", representativeId)
      .single(),
    loadRepresentative(representativeId),
  ]);

  if (receiptError || !oldReceipt) {
    throw new ApiError(404, "وصولي پیدا نه شوه.");
  }

  const oldAmount = Number(oldReceipt.amount || 0);
  const allowedMaximum = roundMoney(
    Math.max(0, loaded.accountTotal - loaded.received) + oldAmount,
  );
  if (amount > allowedMaximum + 0.01) {
    throw new ApiError(400, "وصولي د شرکت له موجوده باقي څخه زیاته ده.");
  }

  const { error } = await supabaseAdmin
    .from("representative_receipts")
    .update({
      receipt_number: receiptNumber,
      amount,
      payment_date: paymentDate,
      notes: request.body.notes ?? oldReceipt.notes ?? null,
    })
    .eq("id", receiptId)
    .eq("representative_id", representativeId);
  if (error) throw new ApiError(400, error.message);

  const next = await loadRepresentative(representativeId);
  return sendData(response, next.account, "Receipt updated");
});

export const addDelivery = asyncHandler(async (request, response) => {
  const quantity = Number(request.body.quantity || 0);
  if (!String(request.body.description || "").trim() || quantity <= 0) {
    throw new ApiError(400, "Description او quantity ضروري دي.");
  }
  const rentType = request.body.rent_type === "ton" ? "ton" : "cbm";
  const weight = Number(request.body.weight_kg || request.body.weight || 0);
  const cbm = Number(request.body.cbm || 0);
  const rate = Number(request.body.rent_rate || 0);
  const rentBase = rentType === "ton" ? weight / 1000 : cbm;
  const rentAmount = roundMoney(rentBase * rate);
  const payload = {
    representative_id: request.params.id,
    description: String(request.body.description).trim(),
    details: request.body.details || null,
    location: request.body.location || null,
    shop_address: request.body.shop_address || null,
    quantity,
    delivered_quantity: 0,
    delivery_date: request.body.delivery_date || new Date().toISOString().slice(0, 10),
    rent_type: rentType,
    rent_rate: rate,
    rent_amount: rentAmount,
    weight_kg: weight,
    cbm,
    price: Number(request.body.price || request.body.goods_price || 0),
    created_by: request.auth.user.id,
  };
  const { data: delivery, error } = await supabaseAdmin
    .from("representative_deliveries")
    .insert(payload)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  const loaded = await loadRepresentative(request.params.id);
  return sendData(
    response,
    { representative: loaded.representative, delivery, deliveries: loaded.deliveries },
    "Delivery added",
    201,
  );
});

export const updateDelivery = asyncHandler(async (request, response) => {
  const loaded = await loadRepresentative(request.params.id);
  const current = loaded.deliveries.find((row) => row.id === request.params.deliveryId);
  if (!current) throw new ApiError(404, "د مال ریکارډ پیدا نه شو.");
  const quantity = Number(request.body.quantity ?? current.quantity);
  if (quantity < Number(current.delivered_quantity || 0)) {
    throw new ApiError(400, "ټول تعداد د تسلیم شوي مقدار څخه کم نه شي کېدای.");
  }
  const rentType = request.body.rent_type || current.rent_type || "cbm";
  const weight = Number(request.body.weight_kg ?? current.weight_kg ?? 0);
  const cbm = Number(request.body.cbm ?? current.cbm ?? 0);
  const rate = Number(request.body.rent_rate ?? current.rent_rate ?? 0);
  const base = rentType === "ton" ? weight / 1000 : cbm;
  const payload = {
    description: request.body.description ?? current.description,
    details: request.body.details ?? current.details,
    location: request.body.location ?? current.location,
    shop_address: request.body.shop_address ?? current.shop_address,
    quantity,
    delivery_date: request.body.delivery_date ?? current.delivery_date,
    rent_type: rentType,
    rent_rate: rate,
    rent_amount: roundMoney(base * rate),
    weight_kg: weight,
    cbm,
    price: Number(request.body.price ?? request.body.goods_price ?? current.price ?? 0),
    bill_name: request.body.bill_name ?? current.bill_name,
    bill_type: request.body.bill_type ?? current.bill_type,
    bill_data_url: request.body.bill_data_url ?? current.bill_data_url,
    bill_uploaded_at: request.body.bill_uploaded_at ?? current.bill_uploaded_at,
  };
  const { data: delivery, error } = await supabaseAdmin
    .from("representative_deliveries")
    .update(payload)
    .eq("id", current.id)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  const next = await loadRepresentative(request.params.id);
  return sendData(response, {
    representative: next.representative,
    delivery,
    deliveries: next.deliveries,
    account: next.account,
  }, "Delivery updated");
});

export const deliverPartial = asyncHandler(async (request, response) => {
  const quantity = Number(request.body.quantity || request.body.delivered_quantity || 0);
  if (quantity <= 0) throw new ApiError(400, "تسلیم شوی مقدار سم نه دی.");
  const loaded = await loadRepresentative(request.params.id);
  const current = loaded.deliveries.find((row) => row.id === request.params.deliveryId);
  if (!current) throw new ApiError(404, "د مال ریکارډ پیدا نه شو.");
  const remaining = deliveryBalance(current);
  if (quantity > remaining) {
    throw new ApiError(400, "تسلیم شوی مقدار له باقي څخه زیات دی.");
  }
  const delivered = Number(current.delivered_quantity || 0) + quantity;
  const history = Array.isArray(current.delivery_history)
    ? [...current.delivery_history]
    : [];
  history.unshift({
    id: randomUUID(),
    quantity,
    date: request.body.date || new Date().toISOString().slice(0, 10),
    notes: request.body.notes || "",
    created_at: new Date().toISOString(),
  });
  const { data: delivery, error } = await supabaseAdmin
    .from("representative_deliveries")
    .update({
      delivered_quantity: delivered,
      last_delivered_at: new Date().toISOString(),
      delivery_history: history,
    })
    .eq("id", current.id)
    .select()
    .single();
  if (error) throw new ApiError(400, error.message);
  const next = await loadRepresentative(request.params.id);
  return sendData(response, {
    representative: next.representative,
    delivery,
    deliveries: next.deliveries,
  }, "Goods delivered");
});

export const deleteReceipt = asyncHandler(async (request, response) => {
  const { id: representativeId, receiptId } = request.params;
  const { data: receipt, error: findError } = await supabaseAdmin
    .from("representative_receipts").select("*")
    .eq("id", receiptId).eq("representative_id", representativeId).single();
  if (findError || !receipt) throw new ApiError(404, "وصولي پیدا نه شوه.");

  const { error } = await supabaseAdmin.from("representative_receipts").delete()
    .eq("id", receiptId).eq("representative_id", representativeId);
  if (error) throw new ApiError(400, error.message);

  const next = await loadRepresentative(representativeId);
  return sendData(response, next.account, "Receipt deleted");
});

export const removeDelivery = asyncHandler(async (request, response) => {
  const { error } = await supabaseAdmin
    .from("representative_deliveries")
    .delete()
    .eq("id", request.params.deliveryId)
    .eq("representative_id", request.params.id);
  if (error) throw new ApiError(400, error.message);
  const next = await loadRepresentative(request.params.id);
  return sendData(
    response,
    { representative: next.representative, deliveries: next.deliveries },
    "Delivery removed",
  );
});

