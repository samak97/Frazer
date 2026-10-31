import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ToastOverlay } from "./components/Overlay/ToastOverlay";
import "./index.css";

// The same bundle serves the main window and the on-top toast window (loaded as index.html#toast).
const isOverlay = window.location.hash === "#toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isOverlay ? <ToastOverlay /> : <App />}</React.StrictMode>,
);
