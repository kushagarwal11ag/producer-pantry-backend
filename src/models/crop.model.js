import mongoose, { Schema } from "mongoose";

const cropSchema = new Schema(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			required: true,
		},
		// category: {
		// 	type: String,
		// },
		image: {
			id: {
				type: String,
				required: true,
			},
			url: {
				type: String,
				required: true,
			},
		},
		price: {
			type: Number,
			required: true,
			default: 1,
		},
		quantity: {
			type: Number,
			required: true,
			default: 1,
			min: 1,
			max: 5,
			validate: {
				validator: Number.isInteger,
				message: "Please use integer for quantity",
			},
		},
		available: {
			type: Boolean,
			default: true,
		},
		farmer: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
	},
	{ timestamps: true }
);

export const Crop = mongoose.model("Crop", cropSchema);
