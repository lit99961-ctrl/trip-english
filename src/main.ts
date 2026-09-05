import { createAppShell } from "./app/create-app";
import { startRouter } from "./app/router";
import "./styles/tokens.css";
import "./styles/global.css";

document.body.replaceChildren(createAppShell());
startRouter();
