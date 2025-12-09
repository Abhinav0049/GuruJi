import { jsx as _jsx } from "react/jsx-runtime";
import { createRoot } from "react-dom/client";
// Use the API-backed app by default so dashboards reflect real Mongo data instead of generated mock data
import App from "./App-with-API.js";
import "./index.css";
createRoot(document.getElementById("root")).render(_jsx(App, {}));
