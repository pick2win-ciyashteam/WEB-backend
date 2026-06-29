import db from "../../../config/db.js";

/* ================= ADD PLAN ================= */
export const addPlanService = async (data) => {
  const {
    name, subtitle, coins, bonus_coins, price,
    currency, currency_symbol, validity_days,
    is_popular, is_pro, is_active, sort_order,
    regular_price, offer_price, discount_pct,
    offer_label, is_offer_active,
  } = data;

  const parsedCoins  = parseInt(coins);
  const parsedBonus  = parseInt(bonus_coins ?? 0);
  const totalMatches = parsedCoins + parsedBonus;          // auto calculate
  const price_per_coin = (parseFloat(price) / parsedCoins).toFixed(4);

  const [[existing]] = await db.execute(
    `SELECT id FROM subscription_plans WHERE name = ?`, [name]
  );
  if (existing) throw new Error("Plan with this name already exists");

  const [result] = await db.execute(
    `INSERT INTO subscription_plans
       (name, subtitle, coins, bonus_coins, matches, price, price_per_coin,
        currency, currency_symbol, validity_days,
        is_popular, is_pro, is_active, sort_order,
        regular_price, offer_price, discount_pct,
        offer_label, is_offer_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      subtitle          || null,
      parsedCoins,
      parsedBonus,
      totalMatches,                 // coins + bonus_coins
      price,
      price_per_coin,
      currency          || "GBP",
      currency_symbol   || "$",
      validity_days     || 365,
      is_popular        ?? 0,
      is_pro            ?? 0,
      is_active         ?? 1,
      sort_order        ?? 0,
      regular_price     || null,
      offer_price       || null,
      discount_pct      || null,
      offer_label       || null,
      is_offer_active   ?? 0,
    ]
  );

  return {
    success: true,
    id: result.insertId,
    message: "Plan added successfully",
    coins: parsedCoins,
    bonus_coins: parsedBonus,
    total_matches: totalMatches,
  };
};

/* ================= GET ALL PLANS (admin) ================= */
 export const getAllPlansAdminService = async () => {
  const [rows] = await db.execute(
    `SELECT
       id, name, subtitle, coins, bonus_coins, matches, price, price_per_coin,
       currency, currency_symbol, validity_days,
       is_popular, is_pro, is_active, sort_order,
         
        
       created_at, updated_at
     FROM subscription_plans ORDER BY sort_order ASC, created_at DESC`
  );
  return { success: true, total: rows.length, data: rows };
};

/* ================= GET ALL PLANS (user) ================= */
export const getAllPlansUserService = async () => {
  const [rows] = await db.execute(
    `SELECT
       id, name, subtitle, coins, bonus_coins, matches, price, price_per_coin,
       currency, currency_symbol, validity_days,
       is_popular, is_pro, sort_order,
       regular_price, offer_price, discount_pct,
       offer_label, is_offer_active
     FROM subscription_plans
     WHERE is_active = 1
     ORDER BY sort_order ASC`
  );
  return { success: true, total: rows.length, data: rows };
};

/* ================= GET PLAN BY ID ================= */
 
export const getPlanByIdService = async (id) => {
  const [[plan]] = await db.execute(
    `SELECT
       id, name, subtitle, coins, bonus_coins, matches, price, price_per_coin,
       currency, currency_symbol, validity_days,
       is_popular, is_pro, is_active, sort_order,
       regular_price, offer_price, discount_pct,
       offer_label, is_offer_active,
       created_at, updated_at
     FROM subscription_plans WHERE id = ?`, [id]
  );
  if (!plan) throw new Error("Plan not found");
  return { success: true, data: plan };
};

/* ================= UPDATE PLAN ================= */
export const updatePlanService = async (id, data) => {
  const ALLOWED = [
    "name", "subtitle", "coins", "bonus_coins", "price",
    "currency", "currency_symbol", "validity_days",
    "is_popular", "is_pro", "is_active", "sort_order",
    "regular_price", "offer_price", "discount_pct",
    "offer_label", "is_offer_active",
  ];

  const sanitized = {};
  for (const key of ALLOWED) {
    if (data[key] !== undefined) sanitized[key] = data[key];
  }

  if (!Object.keys(sanitized).length)
    throw new Error("No valid fields to update");

  const [[current]] = await db.execute(
    `SELECT * FROM subscription_plans WHERE id = ?`, [id]
  );
  if (!current) throw new Error("Plan not found");

  // Recalculate price_per_coin if coins or price changed
  if (sanitized.price !== undefined || sanitized.coins !== undefined) {
    const finalCoins = sanitized.coins !== undefined ? sanitized.coins : current.coins;
    const finalPrice = sanitized.price !== undefined ? sanitized.price : current.price;
    sanitized.price_per_coin = (parseFloat(finalPrice) / parseInt(finalCoins)).toFixed(4);
  }

  // Recalculate matches if coins or bonus_coins changed
  if (sanitized.coins !== undefined || sanitized.bonus_coins !== undefined) {
    const finalCoins  = sanitized.coins       !== undefined ? parseInt(sanitized.coins)       : parseInt(current.coins);
    const finalBonus  = sanitized.bonus_coins !== undefined ? parseInt(sanitized.bonus_coins) : parseInt(current.bonus_coins ?? 0);
    sanitized.matches = finalCoins + finalBonus;
  }

  const setClauses = Object.keys(sanitized).map((k) => `${k} = ?`).join(", ");
  const setValues  = Object.values(sanitized);

  await db.execute(
    `UPDATE subscription_plans SET ${setClauses} WHERE id = ?`,
    [...setValues, id]
  );

  return {
    success: true,
    message: "Plan updated successfully",
    oldPlan: current,
    updatedFields: sanitized,
  };
};

/* ================= DELETE PLAN ================= */
export const deletePlanService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id, name FROM subscription_plans WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Plan not found");

  await db.execute(`DELETE FROM subscription_plans WHERE id = ?`, [id]);
  return {
    success: true,
    message: "Plan deleted successfully",
    planName: existing.name,
  };
};

/* ================= TOGGLE ACTIVE ================= */
export const togglePlanService = async (id) => {
  const [[existing]] = await db.execute(
    `SELECT id, name, is_active FROM subscription_plans WHERE id = ?`, [id]
  );
  if (!existing) throw new Error("Plan not found");

  const newStatus = existing.is_active === 1 ? 0 : 1;
  await db.execute(
    `UPDATE subscription_plans SET is_active = ? WHERE id = ?`,
    [newStatus, id]
  );

  return {
    success:   true,
    is_active: newStatus,
    message:   `Plan ${newStatus ? "activated" : "deactivated"} successfully`,
    planName:  existing.name,
  };
};