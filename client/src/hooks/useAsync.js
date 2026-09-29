import { useCallback, useState } from "react";

export default function useAsync(initialData = null) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const execute = useCallback(async (promiseFactory) => {
    setLoading(true);
    setError("");
    try {
      const result = await promiseFactory();
      setData(result);
      return result;
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Unknown error");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, setData, loading, error, setError, execute };
}
