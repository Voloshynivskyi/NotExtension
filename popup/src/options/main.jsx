import React from "react";
import ReactDOM from "react-dom/client";
import OptionsApp from "./OptionsApp";
import "../index.css"; // <-- IMPORTANT: підтягує ne-токени
import "./options.css";

ReactDOM.createRoot(document.getElementById("root")).render(<OptionsApp />);
