import mongoose, { isValidObjectId } from "mongoose";

import { User } from "../models/user.model.js";
import { Crop } from "../models/crop.model.js";
import {
	uploadOnCloudinary,
	deleteFromCloudinary,
} from "../utils/cloudinary.js";
import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

const getAllCrops = asyncHandler(async (req, res) => {
	const crops = await Crop.aggregate([
		{
			$match: {
				available: true,
			},
		},
		{
			$lookup: {
				from: "users",
				localField: "farmer",
				foreignField: "_id",
				as: "farmer",
				pipeline: [
					{
						$addFields: {
							avatar: "$avatar.url",
						},
					},
					{
						$project: {
							_id: 0,
							name: 1,
							avatar: 1,
							createdAt: 1,
						},
					},
				],
			},
		},
		{
			$addFields: {
				farmer: {
					$first: "$farmer",
				},
				image: "$image.url",
			},
		},
		{
			$sort: {
				createdAt: -1,
			},
		},
		{
			$project: {
				name: 1,
				// category: 1,
				image: 1,
				price: 1,
				quantity: 1,
				farmer: 1,
			},
		},
	]);

	return res
		.status(200)
		.json(new ApiResponse(200, crops, "All crops retrieved successfully"));
});

const getAllUserCrops = asyncHandler(async (req, res) => {
	if (req.user?.role !== "farmer") {
		throw new ApiError(403, "Access forbidden.");
	}

	const userCrops = await Crop.aggregate([
		{
			$match: {
				farmer: new mongoose.Types.ObjectId(req.user?._id),
			},
		},
		{
			$sort: {
				createdAt: -1,
			},
		},
		{
			$addFields: {
				image: "$image.url",
			},
		},
		{
			$project: {
				name: 1,
				// category: 1,
				image: 1,
				price: 1,
				available: 1,
			},
		},
	]);

	return res
		.status(200)
		.json(
			new ApiResponse(200, userCrops, "User crops retrieved successfully")
		);
});

const getCropById = asyncHandler(async (req, res) => {
	const { cropId } = req.params;
	if (!cropId || !isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	const getCrop = await Crop.aggregate([
		{
			$match: {
				_id: new mongoose.Types.ObjectId(cropId),
			},
		},
		{
			$lookup: {
				from: "users",
				localField: "farmer",
				foreignField: "_id",
				as: "farmer",
				pipeline: [
					{
						$addFields: {
							avatar: "$avatar.url",
						},
					},
					{
						$project: {
							_id: 0,
							name: 1,
							avatar: 1,
							createdAt: 1,
						},
					},
				],
			},
		},
		{
			$addFields: {
				farmer: {
					$first: "$farmer",
				},
				image: "$image.url",
			},
		},
		{
			$project: {
				name: 1,
				description: 1,
				// category: 1,
				image: 1,
				price: 1,
				quantity: 1,
				available: 1,
				farmer: 1,
			},
		},
	]);

	if (getCrop?.length === 0) {
		throw new ApiError(404, "Crop not found");
	}

	return res
		.status(200)
		.json(new ApiResponse(200, getCrop, "Crop retrieved successfully"));
});

const createCrop = asyncHandler(async (req, res) => {
	const {
		name,
		description,
		// category,
		price,
		quantity,
		available = true,
	} = req.body;
	const imageLocalPath = req.file?.path;

	if (req.user?.role !== "farmer") {
		throw new ApiError(403, "Access forbidden.");
	}

	if (
		!name.trim() ||
		!description.trim() ||
		!price.trim() ||
		!quantity.trim()
	) {
		throw new ApiError(400, "Fields required");
	}

	if (!imageLocalPath) {
		throw new ApiError(400, "Image file required");
	}

	const image = await uploadOnCloudinary(imageLocalPath);
	if (!image?.url) {
		throw new ApiError(
			500,
			"An unexpected error occurred while uploading image"
		);
	}

	const crop = await Crop.create({
		name,
		description,
		// category,
		image: {
			id: image.public_id,
			url: image.url,
		},
		price,
		quantity,
		available,
		farmer: req.user?._id,
	});

	return res
		.status(200)
		.json(new ApiResponse(200, crop, "Crop created successfully"));
});

const updateCrop = asyncHandler(async (req, res) => {
	const {
		name,
		description,
		// category,
		price,
		quantity,
		available,
	} = req.body;
	const imageLocalPath = req.file?.path;
	const { cropId } = req.params;

	if (req.user?.role !== "farmer") {
		throw new ApiError(403, "Access forbidden.");
	}

	let image;

	if (!cropId || !isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	if (
		!(
			name?.trim() ||
			description?.trim() ||
			price?.trim() ||
			quantity?.trim() ||
			imageLocalPath ||
			available
		)
	) {
		throw new ApiError(400, "No field requested for update");
	}

	const crop = await Crop.findById(cropId);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
	}

	if (crop.farmer?.toString() !== req.user?._id.toString()) {
		throw new ApiError(403, "Access forbidden.");
	}

	if (imageLocalPath) {
		image = await uploadOnCloudinary(imageLocalPath);
		if (!image?.url) {
			throw new ApiError(
				500,
				"An unexpected error occurred while uploading image"
			);
		}

		if (crop.image?.id) {
			await deleteFromCloudinary(crop.image?.id);
		}
	}

	const updatedCrop = await Crop.findByIdAndUpdate(
		cropId,
		{
			$set: {
				name,
				description,
				price,
				quantity,
				available:
					available === true || available === false
						? !crop.available
						: undefined,
				image: {
					id: image?.public_id,
					url: image?.url,
				},
			},
		},
		{ new: true }
	);

	return res
		.status(200)
		.json(new ApiResponse(200, updatedCrop, "Crop updated successfully"));
});

const deleteCrop = asyncHandler(async (req, res) => {
	const { cropId } = req.params;

	if (!cropId || !isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	if (req.user?.role !== "farmer") {
		throw new ApiError(403, "Access forbidden.");
	}

	const crop = await Crop.findById(cropId);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
	}

	if (crop.farmer.toString() !== req.user?._id.toString()) {
		throw new ApiError(403, "Access forbidden.");
	}

	if (crop.image?.id) {
		await deleteFromCloudinary(crop.image?.id);
	}

	await Crop.findByIdAndDelete(cropId);

	return res
		.status(200)
		.json(new ApiResponse(200, {}, "Crop deleted successfully"));
});

export {
	getAllCrops,
	getAllUserCrops,
	getCropById,
	createCrop,
	updateCrop,
	deleteCrop,
};

/*
get all crops ✔️
get all user crops ✔️
get crop (id) ✔️
create crop ✔️
update crop (id) ✔️
delete crop (id) ✔️

// later
update interested retailers [id]
update interested crops in user model [id]
send notification: liked retailer, interested retailer, received feedback
*/
