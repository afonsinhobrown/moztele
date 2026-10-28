"use client";
import { useFormStatus } from "react-dom";

export default function Btn({ children, ...props }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} disabled={pending}>
      {pending ? "A processar…" : children}
    </button>
  );
}
