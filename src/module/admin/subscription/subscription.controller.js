import * as s from "./subscription.service.js";
import { logAdminActivity } from "../../../utils/activity.logger.js";

export const addPlan = async (req, res) => {
  try {
    const result = await s.addPlanService(req.body);
    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "packs",
      action:    "Coin pack added",
      details:   `${req.body.name} added with ${req.body.coins} coins at $${req.body.price}`,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getAllPlans = async (req, res) => {
  try {
    const result = await s.getAllPlansAdminService();
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getPlanById = async (req, res) => {
  try {
    const result = await s.getPlanByIdService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updatePlan = async (req, res) => {
  try {
    const result = await s.updatePlanService(req.params.id, req.body);

    const updatedFields = { ...result.updatedFields };
    delete updatedFields.price_per_coin;

    const details = Object.keys(updatedFields).length
      ? `${result.oldPlan.name} updated (${Object.entries(updatedFields)
          .map(([k, v]) => `${k}: ${result.oldPlan[k]} → ${v}`)
          .join(", ")})`
      : `${result.oldPlan.name} updated`;

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "packs",
      action:    "Coin pack updated",
      details,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const result = await s.deletePlanService(req.params.id);
    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "packs",
      action:    "Coin pack deleted",
      details:   `Plan ${result.planName} deleted`,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const togglePlan = async (req, res) => {
  try {
    const result = await s.togglePlanService(req.params.id);
    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "packs",
      action:    `Coin pack ${result.is_active ? "activated" : "deactivated"}`,
      details:   `Plan ${result.planName} ${result.is_active ? "activated" : "deactivated"}`,
    });
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getUserPlans = async (req, res) => {
  try {
    const result = await s.getAllPlansUserService();
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};