/**
 * 库存查询 API
 * GET /api/inventory
 */

import { Router } from "express";
import { db as pool } from "../utils/db";

const router = Router();

// GET /api/inventory - 查询库存
router.get("/", async (req, res) => {
  try {
    const keyword = req.query.keyword as string;
    const warehouse = req.query.warehouse as string;
    const status = req.query.status as string;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const sort_by = (req.query.sort_by as string) || "date";

    let sql = "SELECT * FROM inventory WHERE 1=1";
    const params: any[] = [];
    let paramIdx = 1;

    if (keyword) {
      sql += " AND item_name ILIKE $" + paramIdx;
      params.push("%" + keyword + "%");
      paramIdx++;
    }

    if (warehouse) {
      sql += " AND warehouse_location ILIKE $" + paramIdx;
      params.push("%" + warehouse + "%");
      paramIdx++;
    }

    if (status) {
      sql += " AND status = $" + paramIdx;
      params.push(status);
      paramIdx++;
    } else {
      sql += " AND status = 'in_stock'";
    }

    // 排序
    switch (sort_by) {
      case "price":
        sql += " ORDER BY purchase_price ASC";
        break;
      case "name":
        sql += " ORDER BY item_name ASC";
        break;
      case "date":
      default:
        sql += " ORDER BY 入库_date DESC";
        break;
    }

    sql += " LIMIT $" + paramIdx;
    params.push(limit);

    const result = await pool.query(sql, params);

    // 计算总价值
    const totalValue = result.rows.reduce((sum: number, row: any) => {
      return sum + (parseFloat(row.purchase_price) * parseInt(row.quantity));
    }, 0);

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      total_value: totalValue.toFixed(2),
      query: { keyword, warehouse, status, sort_by }
    });
  } catch (err: any) {
    console.error("[Inventory] Query error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/inventory/stats - 库存统计
router.get("/stats", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(purchase_price * quantity) as total_value,
        COUNT(DISTINCT warehouse_location) as warehouse_locations
      FROM inventory
      WHERE status = 'in_stock'
    `);

    const categoryResult = await pool.query(`
      SELECT
        SPLIT_PART(warehouse_location, '-', 1) as warehouse,
        COUNT(*) as item_count,
        SUM(quantity) as total_qty
      FROM inventory
      WHERE status = 'in_stock'
      GROUP BY SPLIT_PART(warehouse_location, '-', 1)
      ORDER BY warehouse
    `);

    res.json({
      success: true,
      data: {
        ...result.rows[0],
        warehouse_breakdown: categoryResult.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as inventoryRouter };
