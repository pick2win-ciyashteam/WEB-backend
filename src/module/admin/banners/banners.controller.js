import * as s from "./banners.service.js";

export const addBanner = async (req, res) => {
  try {
    const result = await s.addBannerService(req.body);
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

export const getBannerById = async (req, res) => {
  try {
    const result = await s.getBannerByIdService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateBanner = async (req, res) => {
  try {
    const result = await s.updateBannerService(req.params.id, req.body);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteBanner = async (req, res) => {
  try {
    const result = await s.deleteBannerService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const toggleBanner = async (req, res) => {
  try {
    const result = await s.toggleBannerService(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};