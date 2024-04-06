import { Router } from "express";
import {
	getAllCrops,
	getAllUserCrops,
	getCropById,
	createCrop,
	updateCrop,
	deleteCrop,
} from "../controllers/crop.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

// secured routes
router.route("/all-crops").get(verifyJWT, getAllCrops);
router.route("/user-crops").get(verifyJWT, getAllUserCrops);
router.route("/crop").post(verifyJWT, upload.single("image"), createCrop);
router
	.route("/crop/:cropId")
	.get(verifyJWT, getCropById)
	.patch(verifyJWT, upload.single("image"), updateCrop)
	.delete(verifyJWT, deleteCrop);
