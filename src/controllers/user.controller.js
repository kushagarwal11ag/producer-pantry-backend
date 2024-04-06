import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";
import { validateUser } from "../utils/validators.js";
import {
	uploadOnCloudinary,
	deleteFromCloudinary,
} from "../utils/cloudinary.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

const options = {
	httpOnly: true,
	secure: true,
};

const generateAccessAndRefreshTokens = async (userId) => {
	try {
		const user = await User.findById(userId);
		const accessToken = user.generateAccessToken();
		const refreshToken = user.generateRefreshToken();

		user.refreshToken = refreshToken;
		await user.save({ validateBeforeSave: false });

		return { accessToken, refreshToken };
	} catch (error) {
		throw new ApiError(500, "Error generating tokens");
	}
};

const handleFileUpload = async (filePath, fileType) => {
	if (!filePath) return null;

	const uploadedFile = await uploadOnCloudinary(filePath);
	if (!uploadedFile?.url) {
		throw new ApiError(500, `Failed to upload ${fileType}`);
	}

	return { id: uploadedFile?.public_id, url: uploadedFile?.url };
};

const registerUser = asyncHandler(async (req, res) => {
	const { name, email, password, role } = req.body;

	const { error } = validateUser({ name, email, password });
	if (error) {
		throw new ApiError(
			400,
			`Validation error: ${error.details[0].message}`
		);
	}

	if (!(role === "farmer" || role === "retailer")) {
		throw new ApiError(400, "Invalid role selected.");
	}

	const existingUser = await User.find({ email });
	if (existingUser.length > 0) {
		throw new ApiError(
			409,
			"A user with the provided email already exists"
		);
	}

	const user = await User.create({
		name,
		email,
		password,
		role,
	});

	const createdUser = await User.findById(user._id).select(
		"-password -refreshToken"
	);

	return res
		.status(201)
		.json(
			new ApiResponse(201, createdUser, "User registered successfully")
		);
});

const loginUser = asyncHandler(async (req, res) => {
	const { email, password } = req.body;

	// check email, password validation
	const { error } = validateUser({ email, password });
	if (error) {
		throw new ApiError(
			400,
			`Validation error: ${error.details[0].message}`
		);
	}

	const user = await User.findOne({ email });
	if (!user) {
		throw new ApiError(404, "User not found");
	}

	const isPasswordValid = await user.isPasswordCorrect(password);
	if (!isPasswordValid) {
		throw new ApiError(401, "Invalid Credentials");
	}

	const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
		user._id
	);

	const loggedInUser = await User.findById(user._id).select(
		"-password -refreshToken"
	);

	return res
		.status(200)
		.cookie("accessToken", accessToken, options)
		.cookie("refreshToken", refreshToken, options)
		.json(
			new ApiResponse(
				200,
				{
					user: loggedInUser,
					accessToken,
					refreshToken,
				},
				"User logged in successfully"
			)
		);
});

const getCurrentUser = asyncHandler(async (req, res) => {
	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				req.user,
				"Current user retrieved successfully"
			)
		);
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
	const { oldPassword, newPassword } = req.body;
	if (!oldPassword || !newPassword) {
		throw new ApiError(400, "Both old and new passwords are required");
	}

	const { error: oldPasswordError } = validateUser({ password: oldPassword });
	const { error: newPasswordError } = validateUser({ password: newPassword });

	if (oldPasswordError || newPasswordError) {
		let errorMessage = oldPasswordError
			? oldPasswordError.details[0].message
			: newPasswordError.details[0].message;
		throw new ApiError(400, `Validation error: ${errorMessage}`);
	}

	if (oldPassword === newPassword) {
		throw new ApiError(400, "New password cannot be same as the old one");
	}

	const user = await User.findById(req.user?._id);
	const isPasswordValid = await user.isPasswordCorrect(oldPassword);
	if (!isPasswordValid) {
		throw new ApiError(400, "The old password is incorrect");
	}

	user.password = newPassword;
	await user.save({ validateBeforeSave: false });

	return res
		.status(200)
		.json(new ApiResponse(200, {}, "Password changed successfully"));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
	const { name, address, phone } = req.body;

	if (name) {
		const { error } = validateUser({
			name,
		});
		if (error) {
			throw new ApiError(
				400,
				`Validation error: ${error.details[0].message}`
			);
		}
	}

	// if (address) {
	// 	tempUser.address = address;
	// }

	if (phone) {
		const { error } = validateUser({
			phone,
		});
		if (error) {
			throw new ApiError(
				400,
				`Validation error: ${error.details[0].message}`
			);
		}
	}

	if (!(name || address || phone)) {
		throw new ApiError(400, "No field requested for update");
	}

	const updatedUser = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				name,
				address,
				phone,
			},
		},
		{ new: true }
	).select("-password -refreshToken");

	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				updatedUser,
				"Account details updated successfully"
			)
		);
});

const updateAccountFiles = asyncHandler(async (req, res) => {
	const avatarLocalPath = req.files?.avatar?.[0]?.path;
	const govIdLocalPath = req.files?.govId?.[0]?.path;
	const certificationLocalPath = req.files?.certification?.[0]?.path;

	if (!(avatarLocalPath || govIdLocalPath || certificationLocalPath)) {
		throw new ApiError(400, "Upload files to proceed");
	}

	const user = await User.findById(req.user?._id);

	const uploadObject = {};

	if (avatarLocalPath) {
		const avatar = await handleFileUpload(avatarLocalPath, "avatar");
		uploadObject.avatar = {
			id: avatar.id,
			url: avatar.url,
		};
	}
	if (govIdLocalPath) {
		const govId = await handleFileUpload(govIdLocalPath, "govId");
		uploadObject.govId = {
			id: govId.id,
			url: govId.url,
		};
	}
	if (certificationLocalPath) {
		const certification = await handleFileUpload(
			certificationLocalPath,
			"certification"
		);
		uploadObject.certification = {
			id: certification.id,
			url: certification.url,
		};
	}

	const updatedUser = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				...uploadObject,
			},
		},
		{ new: true }
	).select("-password -refreshToken");

	if (avatarLocalPath && user?.avatar?.id) {
		await deleteFromCloudinary(user?.avatar?.id);
	}
	if (govIdLocalPath && user?.govId?.id) {
		await deleteFromCloudinary(user?.govId?.id);
	}
	if (certificationLocalPath && user?.certification?.id) {
		await deleteFromCloudinary(user?.certification?.id);
	}

	return res
		.status(200)
		.json(
			new ApiResponse(200, updatedUser, "User files updated successfully")
		);
});

const deleteAvatar = asyncHandler(async (req, res) => {
	const user = await User.findById(req.user?._id);

	if (!user?.avatar?.id) {
		throw new ApiError(400, "Avatar does not exist. Nothing to delete");
	}

	const deletedUser = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$unset: {
				avatar: 1,
			},
		},
		{ new: true }
	).select("-password -refreshToken");

	if (user.avatar?.id) {
		await deleteFromCloudinary(user?.avatar?.id);
	}

	return res
		.status(200)
		.json(
			new ApiResponse(
				200,
				deletedUser,
				"User avatar deleted successfully"
			)
		);
});

const logoutUser = asyncHandler(async (req, res) => {
	await User.findByIdAndUpdate(
		req.user?._id,
		{
			$unset: {
				refreshToken: 1,
			},
		},
		{
			new: true,
		}
	);

	return res
		.status(200)
		.clearCookie("accessToken", options)
		.clearCookie("refreshToken", options)
		.json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
	const incomingRefreshToken =
		req.cookies?.refreshToken || req.body?.refreshToken;

	if (!incomingRefreshToken) {
		throw new ApiError(401, "Unauthorized request");
	}

	try {
		const decodedToken = jwt.verify(
			incomingRefreshToken,
			process.env.REFRESH_TOKEN_SECRET
		);
		const user = await User.findById(decodedToken?._id);

		if (!user || incomingRefreshToken !== user?.refreshToken) {
			throw new ApiError(401, "Invalid or expired refresh token.");
		}

		const { accessToken, refreshToken: newRefreshToken } =
			await generateAccessAndRefreshTokens(user._id);

		return res
			.status(200)
			.cookie("accessToken", accessToken, options)
			.cookie("refreshToken", newRefreshToken, options)
			.json(
				new ApiResponse(
					200,
					{ accessToken, refreshToken: newRefreshToken },
					"Access token refreshed successfully."
				)
			);
	} catch (error) {
		throw new ApiError(401, error?.message || "Invalid refresh token");
	}
});

export {
	registerUser,
	loginUser,
	getCurrentUser,
	changeCurrentPassword,
	updateAccountDetails,
	updateAccountFiles,
	deleteAvatar,
	logoutUser,
	refreshAccessToken,
};

/*
generate access and refresh tokens ✔️
register user ✔️
get current user ✔️
login user ✔️
update user -> name, role, address, phone ✔️
change password ✔️
update files: avatar, govId, certification ✔️
delete avatar ✔️
logout user ✔️
refresh access token ✔️

//later
get particular user (id)
*/
