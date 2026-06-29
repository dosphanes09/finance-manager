import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./register-service-worker";

createRoot(document.getElementById("root")!).render(<App />);
registerServiceWorker();
