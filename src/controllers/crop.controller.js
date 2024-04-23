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
				available: 1,
				farmer: 1,
				createdAt: 1,
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
				createdAt: 1,
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
			price ||
			quantity ||
			imageLocalPath ||
			available !== undefined
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
				available: available !== undefined ? available : crop.available,
				image: {
					id: image ? image.public_id : crop.image.id,
					url: image ? image.url : crop.image.url,
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

const addCropToCart = asyncHandler(async (req, res) => {
	const { cropId } = req.params;
	const { quantity = 1 } = req.body;

	if (!cropId || !isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	if (isNaN(quantity) || quantity <= 0 || quantity > 5) {
		throw new ApiError(
			400,
			"Invalid quantity. Quantity must be between 1 and 5."
		);
	}

	if (req.user?.role !== "retailer") {
		throw new ApiError(403, "Access forbidden.");
	}

	const crop = await Crop.findById(cropId);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
	}

	if (crop.quantity < quantity) {
		throw new ApiError(400, "Quantity limit exceeded");
	}

	const updatedUser = await User.findOneAndUpdate(
		{ _id: req.user?._id, "cart.crop": cropId },
		{
			$set: { "cart.$[elem].quantity": quantity },
		},
		{
			new: true,
			arrayFilters: [{ "elem.crop": cropId }],
		}
	);

	if (!updatedUser) {
		await User.findByIdAndUpdate(
			req.user?._id,
			{
				$push: {
					cart: {
						crop: cropId,
						quantity,
					},
				},
			},
			{ new: true }
		);
	}

	return res
		.status(200)
		.json(new ApiResponse(200, {}, "Crop updated in cart successfully"));
});

const removeFromCart = asyncHandler(async (req, res) => {
	const { cropId } = req.params;

	if (!cropId || !isValidObjectId(cropId)) {
		throw new ApiError(400, "Invalid or missing crop ID");
	}

	if (req.user?.role !== "retailer") {
		throw new ApiError(403, "Access forbidden.");
	}

	const crop = await Crop.findById(cropId);
	if (!crop) {
		throw new ApiError(404, "Crop not found");
	}

	const cropExists = req.user?.cart.some(
		(item) => item.crop.toString() === cropId
	);
	if (!cropExists) {
		throw new ApiError(404, "Crop not found in cart");
	}

	await User.findByIdAndUpdate(req.user?._id, {
		$pull: {
			cart: {
				crop: cropId,
			},
		},
	});

	return res
		.status(200)
		.json(new ApiResponse(200, {}, "Crop removed from cart successfully"));
});

const viewCart = asyncHandler(async (req, res) => {
	if (req.user?.role !== "retailer") {
		throw new ApiError(403, "Access Forbidden.");
	}

	const cart = await User.aggregate([
		{
			$match: {
				_id: new mongoose.Types.ObjectId(req.user?._id),
			},
		},
		{
			$unwind: "$cart",
		},
		{
			$lookup: {
				from: "crops",
				localField: "cart.crop",
				foreignField: "_id",
				as: "cropDetails",
			},
		},
		{
			$unwind: "$cropDetails",
		},
		{
			$project: {
				_id: 0,
				cropId: "$cropDetails._id",
				name: "$cropDetails.name",
				image: "$cropDetails.image.url",
				price: "$cropDetails.price",
				quantity: "$cart.quantity",
			},
		},
	]);

	return res
		.status(200)
		.json(new ApiResponse(200, cart, "Cart retrieved successfully"));
});

export {
	getAllCrops,
	getAllUserCrops,
	getCropById,
	createCrop,
	updateCrop,
	deleteCrop,
	viewCart,
	addCropToCart,
	removeFromCart,
};

/*
get all crops ✔️
get all user crops ✔️
get crop (id) ✔️
create crop ✔️
update crop (id) ✔️
delete crop (id) ✔️
view cart ✔️
add to cart (id) ✔️
delete from cart (id) ✔️

// later
update interested retailers [id]
update interested crops in user model [id]
send notification: liked retailer, interested retailer, received feedback
*/
