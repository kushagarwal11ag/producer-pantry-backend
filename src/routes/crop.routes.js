import { Router } from "express";
import {
	getAllCrops,
	getAllUserCrops,
	getCropById,
	createCrop,
	updateCrop,
	deleteCrop,
	viewCart,
	addCropToCart,
	removeFromCart,
} from "../controllers/crop.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/all-crops").get(verifyJWT, getAllCrops);
router.route("/my-crops").get(verifyJWT, getAllUserCrops);
router.route("/crop").post(verifyJWT, upload.single("image"), createCrop);
router
	.route("/crop/:cropId")
	.get(verifyJWT, getCropById)
	.patch(verifyJWT, upload.single("image"), updateCrop)
	.delete(verifyJWT, deleteCrop);
router.route("/cart").get(verifyJWT, viewCart);
router
	.route("/cart/:cropId")
	.patch(verifyJWT, addCropToCart)
	.delete(verifyJWT, removeFromCart);

export default router;
