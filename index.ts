import express, { Express, Request, Response } from "express";
import cors from "cors";
import { ScannedItem, Product, ScanRequest, ApiResponse } from "./src/types/Types";

const app: Express = express();
const PORT: number = parseInt(process.env.PORT || "5000", 10);

// Middleware
app.use(cors());
app.use(express.json());

let scannedItems: ScannedItem[] = [];

const productDatabase: Record<string, Product> = {
  "5901234123457": { name: "Organic Whole Milk", price: 4.99 },
  "5012345678900": { name: "Whole Wheat Bread", price: 3.49 },
  "1234567890128": { name: "Spring Water 1L", price: 1.25 },
  "7891234567895": { name: "Free-Range Eggs (Dozen)", price: 5.75 },
  "9827348723400": { name: "Java Programming Book", price: 49.99 },
  DEFAULT: { name: "Unknown Product", price: 0.0 },
};

app.get(
  "/api/items",
  (req: Request, res: Response<ApiResponse<ScannedItem[]>>) => {
    try {
      res.json({ data: scannedItems });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  }
);

app.post(
  "/api/scan",
  (
    req: Request<{}, {}, ScanRequest>,
    res: Response<ApiResponse<ScannedItem>>
  ) => {
    try {
      const { barcode } = req.body;

      if (!barcode) {
        return res.status(400).json({ error: "Barcode is required" });
      }

      console.log(`Received barcode: ${barcode}`);
      const product: Product =
        productDatabase[barcode] || productDatabase["DEFAULT"];

      const newItem: ScannedItem = {
        id: Date.now(),
        barcode,
        name: product.name,
        price: product.price,
        timestamp: new Date().toLocaleTimeString(),
      };

      scannedItems.push(newItem);

      res.status(201).json({ data: newItem });
    } catch (error) {
      console.error("Error processing scan:", error);
      res.status(500).json({ error: "Failed to process barcode" });
    }
  }
);

// Clear all items
app.delete("/api/items", (req: Request, res: Response<ApiResponse>) => {
  try {
    scannedItems = [];
    res.json({ message: "All items cleared" });
  } catch (error) {
    res.status(500).json({ error: "Failed to clear items" });
  }
});

// Health check endpoint
app.get("/health", (req: Request, res: Response<ApiResponse>) => {
  res.json({ message: "Server is running" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
