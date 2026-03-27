import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app";
import "./index.css";
import { AdminLocaleProvider } from "./lib/locale";

const basename = import.meta.env.DEV ? "/" : "/admin";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AdminLocaleProvider>
      <BrowserRouter basename={basename}>
        <App />
      </BrowserRouter>
    </AdminLocaleProvider>
  </StrictMode>,
);
