import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "../sweetlight_magnetool_21.3.26.jsx";

const rootNode = document.getElementById("root");

function applyBootstrapDocumentLayout() {
  if (typeof document === "undefined") return;
  const docEl = document.documentElement;
  const body = document.body;
  if (docEl) {
    docEl.style.width = "100%";
    docEl.style.height = "100%";
    docEl.style.margin = "0";
    docEl.style.padding = "0";
  }
  if (body) {
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.margin = "0";
    body.style.padding = "0";
  }
  if (rootNode) {
    rootNode.style.width = "100%";
    rootNode.style.height = "100%";
    rootNode.style.margin = "0";
    rootNode.style.padding = "0";
  }
}

function showBootstrapError(title, details) {
  if (!rootNode) return;
  rootNode.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F172A;padding:24px;box-sizing:border-box;font-family:Heebo,Arial,sans-serif;direction:rtl">
      <div style="max-width:720px;width:100%;background:#FFFFFF;border-radius:20px;padding:24px;box-shadow:0 24px 80px rgba(15,23,42,.28)">
        <div style="font-size:26px;font-weight:800;color:#111827;margin-bottom:10px">${title}</div>
        <div style="font-size:15px;line-height:1.7;color:#4B5563;margin-bottom:14px">האפליקציה נתקלה בשגיאה בזמן טעינה. אם זה קורה גם באייפון, אפשר לצלם את המסך הזה ונמשיך משם.</div>
        <pre style="white-space:pre-wrap;word-break:break-word;background:#F8FAFC;border:1px solid #E5E7EB;border-radius:14px;padding:14px;font-size:13px;line-height:1.6;color:#7C2D12;margin:0">${details}</pre>
      </div>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const details = [
    event.message || "Unknown error",
    event.filename || "",
    event.lineno ? `line ${event.lineno}` : "",
    event.colno ? `col ${event.colno}` : "",
  ].filter(Boolean).join(" | ");
  showBootstrapError("שגיאת טעינה", details);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason instanceof Error
    ? `${event.reason.name}: ${event.reason.message}`
    : String(event.reason || "Unhandled promise rejection");
  showBootstrapError("שגיאת טעינה", reason);
});

try {
  applyBootstrapDocumentLayout();
  createRoot(rootNode).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  showBootstrapError("שגיאת טעינה", details);
}
