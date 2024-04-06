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
						$project: {
							name: 1,
							"avatar.url": 1,
						},
					},
				],
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
			},
		},
	]);

	return res
		.status(200)
		.json(new ApiResponse(200, crops, "All crops retrieved successfully"));
});

const getAllUserCrops = asyncHandler(async (req, res) => {
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
			$project: {
				_id: 1,
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

	const crop = await Crop.findById(cropId);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
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
						$project: {
							name: 1,
							"avatar.url": 1,
						},
					},
				],
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
			},
		},
	]);

	return res.status(200, getCrop, "Crop retrieved successfully");
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

	const farmer = await User.findById(req.user?._id);
	if (!farmer) {
		throw new ApiError(404, "Farmer not found");
	}
	if (!(farmer?.role === "farmer")) {
		throw new ApiError(403, "Access forbidden.");
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
		farmer,
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

	let image;

	if (!cropId || isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	if (
		!(
			name.trim() ||
			description.trim() ||
			price.trim() ||
			quantity.trim() ||
			imageLocalPath ||
			available
		)
	) {
		throw new ApiError(400, "No field requested for update");
	}

	const crop = await Crop.aggregate([
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
						$project: {
							_id: 1,
							role: 1,
						},
					},
					{
						$addFields: {
							farmer: {
								$first: "$farmer",
							},
						},
					},
				],
			},
		},
	]);
	if (crop?.length === 0) {
		throw new ApiError(404, "Crop not found");
	}

	if (
		crop[0].farmer?._id.toString() !== req.user?._id.toString() ||
		crop[0].farmer?.role !== "farmer"
	) {
		throw new ApiError(403, "Forbidden Access.");
	}

	if (imageLocalPath) {
		image = await uploadOnCloudinary(imageLocalPath);
		if (!image?.url) {
			throw new ApiError(
				500,
				"An unexpected error occurred while uploading image"
			);
		}

		const deletedCropImage = await deleteFromCloudinary(crop[0]?.image?.id);
		if (deletedCropImage) {
			throw new ApiError(500, deletedCropImage);
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
						? !crop[0].available
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

	if (!cropId || isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	const crop = await Crop.aggregate([
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
						$project: {
							_id: 1,
							role: 1,
						},
					},
				],
			},
		},
	]);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
	}

	if (
		crop.farmer?._id.toString() !== req.user?._id.toString() ||
		crop.farmer?.role !== "farmer"
	) {
		throw new ApiError(403, "Forbidden Access.");
	}

	await Crop.findByIdAndDelete(cropId);

	const deletedCropImage = await deleteFromCloudinary(crop[0]?.image?.id);
	if (deletedCropImage) {
		throw new ApiError(500, deletedCropImage);
	}

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
