import mongoose from "mongoose";
import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";
import { validateUser } from "../utils/validators.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
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

	return uploadedFile?.url;
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
	if (existingUser) {
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

	const user = await User.find({ email });
	if (!user) {
		throw new ApiError(404, "User not found");
	}

	const isPasswordValid = await user.isPasswordCorrect(password);
	if (!isPasswordValid) {
		throw new ApiError(401, "Invalid Credentials");
	}

	const { accessToken, refreshToken } = generateAccessAndRefreshTokens(
		user._id
	);

	const loggedInUser = await User.findById(user.id).select(
		"-password -refreshToken"
	);

	return res
		.status(200)
		.cookie("accessToken", accessToken, options)
		.cookie("refreshToken", refreshToken, options)
		.json(
			new ApiResponse(200, loggedInUser, "User logged in successfully")
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

	const user = await User.findById(user?._id);
	const isPasswordValid = user.isPasswordCorrect(oldPassword);
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
	const { name, role, address, phone } = req.body;

	const tempUser = {};

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

		tempUser.name = name;
	}

	if (role) {
		if (!(role === "farmer" || role === "retailer")) {
			throw new ApiError(400, "Invalid role selected.");
		}
		tempUser.role = role;
	}

	if (address) {
		tempUser.address = address;
	}

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

		tempUser.phone = phone;
	}

	if (isEmpty(tempUser)) {
		throw new ApiError(
			400,
			"Fields are required for updating user details"
		);
	}

	const updatedUser = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				...tempUser,
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

	const avatarUrl = handleFileUpload(avatarLocalPath, "avatar");
	const govIdUrl = handleFileUpload(govIdLocalPath, "govId");
	const certificationUrl = handleFileUpload(
		certificationLocalPath,
		"certification"
	);

	const updatedUser = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$set: {
				avatar: avatarUrl,
				govId: govIdUrl,
				certification: certificationUrl,
			},
		},
		{ new: true }
	).select("-password -refreshToken");

	//TODO: after updating new image, delete old image - assignment

	return res
		.status(200)
		.json(
			new ApiResponse(200, updatedUser, "User files updated successfully")
		);
});

const deleteAvatar = asyncHandler(async (req, res) => {
	const user = await User.findByIdAndUpdate(
		req.user?._id,
		{
			$unset: {
				avatar: 1,
			},
		},
		{ new: true }
	);

	//TODO: after deleting avatar, delete old image - assignment

	return res
		.status(200)
		.json(new ApiResponse(200, user, "User avatar deleted successfully"));
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
update files: avatar, govId, certification ✔️ ❌
delete avatar ✔️ ❌
logout user ✔️
refresh access token ✔️

//later
get particular user (id)
*/