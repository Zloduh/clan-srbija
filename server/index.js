// server/index.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  if (req.headers["x-forwarded-proto"] !== "https" && process.env.NODE_ENV === "production") {
    return res.redirect("https://" + req.headers.host + req.url);
  }
  next();
});

app.use(express.static(path.join(__dirname, "../")));

app.get("/api/status", (req, res) => {
  res.json({ message: "SRBIJA Clan server is online 🔥" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
