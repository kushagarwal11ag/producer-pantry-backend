import { Router } from "express";
import {
	registerUser,
	loginUser,
	getCurrentUser,
	changeCurrentPassword,
	updateAccountDetails,
	updateAccountFiles,
    deleteAvatar,
	logoutUser,
	refreshAccessToken,
} from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import verifyJWT from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);
router.route("/refresh-token").post(refreshAccessToken);

// secured routes
router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/update").patch(verifyJWT, updateAccountDetails);
router.route("/update-file").patch(
	verifyJWT,
	upload.fields([
		{ name: "avatar", maxCount: 1 },
		{ name: "govId", maxCount: 1 },
		{ name: "certification", maxCount: 1 },
	]),
	updateAccountFiles
);
router.route("/avatar").delete(verifyJWT, deleteAvatar)
router.route("/logout").post(verifyJWT, logoutUser);

export default router;
