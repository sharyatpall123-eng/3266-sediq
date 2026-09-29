import { useState } from "react";
import axios from "axios";

export default function TestWeeklyWhatsAppButton({ customerId }) {
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const sendTest = async () => {
    if (!customerId || sending) return;

    const confirmed = window.confirm(
      "ایا Test اوونیز WhatsApp راپور یوازې همدې قرضدار ته ولېږل شي؟"
    );

    if (!confirmed) return;

    try {
      setSending(true);
      setStatus("");

      const response = await axios.post(
        `/api/whatsapp-test/weekly/${customerId}`
      );

      setStatus(
        response?.data?.message ||
          "Test راپور په بریالیتوب سره ولېږل شو."
      );
    } catch (error) {
      setStatus(
        error?.response?.data?.message ||
          error?.message ||
          "Test راپور ونه لېږل شو."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={sendTest}
        disabled={!customerId || sending}
        className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "لېږل کېږي..." : "Test WhatsApp Report"}
      </button>

      {status ? (
        <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-semibold text-slate-700">
          {status}
        </div>
      ) : null}
    </div>
  );
}