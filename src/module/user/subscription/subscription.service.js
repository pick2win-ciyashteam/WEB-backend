import db from "../../../config/db.js";

export const getMySubscriptionService = async (userId) => {
  const [[subscription]] = await db.query(
    `SELECT
        us.id,
        us.plan_id,
        us.plan_name,
        us.coins,
        us.matches_allowed,
        us.matches_used,
        (us.matches_allowed - us.matches_used) AS matches_remaining,
        us.amount,
        us.start_date,
        us.expiry_date,
        us.status,
        us.created_at,

        sp.offer_label,
        sp.price_per_coin,
        sp.validity_days,
        sp.is_popular,
        sp.is_pro,
        sp.bonus_coins
     FROM user_subscriptions us
     LEFT JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = ?
       AND us.status = 'active'
       AND us.expiry_date > NOW()
     ORDER BY us.id DESC
     LIMIT 1`,
    [userId]
  );

  return subscription || null;
};