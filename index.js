const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/politcraft";
const JWT_SECRET = process.env.JWT_SECRET || "super_secret_jwt_key";

// ==========================================
// 1. MIDDLEWARES
// ==========================================
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000", credentials: true }));
app.use(express.json({ limit: "10mb" }));


// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied. Token missing." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
};

// ==========================================
// 2. MONGOOSE SCHEMAS & MODELS
// ==========================================

// User Schema
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// Poster Schema
const posterSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    occasion: { type: String, required: true },
    name: { type: String, required: true },
    designation: { type: String, required: true },
    party: { type: String, required: true },
    location: { type: String, required: true },
    headline: { type: String, required: true },
    photoUrl: { type: String },
    themeGradient: { type: String },
    borderColor: { type: String },
    bannerColor: { type: String },
  },
  { timestamps: true }
);

const Poster = mongoose.model("Poster", posterSchema);

// ==========================================
// 3. API ROUTES
// ==========================================

// Root API Healthcheck
app.get("/", (req, res) => {
  res.send({ status: "OK", message: "AI Political Poster Maker Single-File API is running" });
});

// Auth Routes: Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, passwordHash });

    const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Server Error" });
  }
});

// Auth Routes: Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Logged in successfully",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Server Error" });
  }
});

// Poster Routes: Save Poster
app.post("/api/posters/save", authenticateToken, async (req, res) => {
  try {
    const posterData = req.body;
    const poster = await Poster.create({
      ...posterData,
      userId: req.userId,
    });

    res.status(201).json({ message: "Poster saved successfully", poster });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to save poster" });
  }
});

// Poster Routes: Fetch User Posters History
app.get("/api/posters/my-posters", authenticateToken, async (req, res) => {
  try {
    const posters = await Poster.find({ userId: req.userId }).sort({ createdAt: -1 });
    res.json(posters);
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to fetch posters" });
  }
});

// Poster Routes: Update Poster
app.put("/api/posters/:id", authenticateToken, async (req, res) => {
  try {
    const poster = await Poster.findOneAndUpdate(
      { _id: req.params.id, userId: req.userId },
      req.body,
      { new: true }
    );
    if (!poster) return res.status(404).json({ error: "Poster not found" });
    res.json({ message: "Poster updated successfully", poster });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to update poster" });
  }
});

// Poster Routes: Delete Poster
app.delete("/api/posters/:id", authenticateToken, async (req, res) => {
  try {
    const poster = await Poster.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!poster) return res.status(404).json({ error: "Poster not found" });
    res.json({ message: "Poster deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to delete poster" });
  }
});

// ==========================================
// 4. DATABASE CONNECTION & SERVER START
// ==========================================
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB Connection Error:", err);
  });