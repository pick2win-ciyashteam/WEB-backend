import * as s from "./subscription.service.js";

export const addPlan = async (req, res) => {
  try {
    const result = await s.addPlanService(req.body);
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
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deletePlan = async (req, res) => {
  try {
    const result = await s.deletePlanService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const togglePlan = async (req, res) => {
  try {
    const result = await s.togglePlanService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};