const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "src", "index.js");
const distDir = path.join(__dirname, "..", "dist");
const dist = path.join(distDir, "index.js");

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(src, dist);
console.log("Built:", dist);
