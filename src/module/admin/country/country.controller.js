import * as s from "./country.service.js";
import { logAdminActivity } from "../../../utils/activity.logger.js";

export const addCountry = async (req, res) => {
  try {
    const result = await s.addCountryService(req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Country added",
      details:   `Added country ${req.body.name} (${req.body.code})`,
    });

    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};


export const getAllCountries = async (req, res) => {
  try {
    const result = await s.getAllCountriesAdminService();
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const updateCountry = async (req, res) => {
  try {
    const result = await s.updateCountryService(req.params.id, req.body);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Country updated",
      details:   `Updated country ${req.params.id}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteCountry = async (req, res) => {
  try {
    const result = await s.deleteCountryService(req.params.id);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    "Country deleted",
      details:   `Deleted country ${req.params.id}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const toggleCountry = async (req, res) => {
  try {
    const result = await s.toggleCountryService(req.params.id);

    await logAdminActivity({
      adminId:   req.admin.id,
      adminName: req.admin.email,
      adminRole: req.admin.role,
      category:  "catalog",
      action:    `Country ${result.is_active ? "activated" : "deactivated"}`,
      details:   `Country ${req.params.id} ${result.is_active ? "activated" : "deactivated"}`,
    });

    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};