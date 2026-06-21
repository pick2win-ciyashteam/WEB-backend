import * as s from "./banners.service.js";
import { logAdminActivity } from "../../../utils/activity.logger.js";

export const addBanner = async (req, res) => {
  try {
    const result = await s.addBannerService(req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Banner added",
      details:   `Added banner ${req.body.name || req.body.heading || result.id}`,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getAllBanners = async (req, res) => {
  try {
    const result = await s.getAllBannersAdminService();  // ✅ no page/limit
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

 

export const updateBanner = async (req, res) => {
  try {
    const result = await s.updateBannerService(req.params.id, req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Banner updated",
      details:   `Updated banner ${req.params.id}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    const result = await s.deleteBannerService(req.params.id);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Banner deleted",
      details:   `Deleted banner ${req.params.id}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const toggleBanner = async (req, res) => {
  try {
    const result = await s.toggleBannerService(req.params.id);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    `Banner ${result.is_active ? "activated" : "deactivated"}`,
      details:   `Banner ${req.params.id} ${result.is_active ? "activated" : "deactivated"}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};