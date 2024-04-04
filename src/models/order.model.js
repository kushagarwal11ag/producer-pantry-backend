import mongoose, { Schema } from "mongoose";

const orderSchema = new Schema(
	{
		items: [
			{
				crop: {
					type: Schema.Types.ObjectId,
					ref: "Crop",
					required: true,
				},
				quantity: {
					type: Number,
					required: true,
				},
			},
		],
		totalPrice: {
			type: Number,
			required: true,
		},
		status: {
			type: String,
			enum: ["pending", "completed", "cancelled"],
			default: "pending",
		},
		retailer: {
			type: Schema.Types.ObjectId,
			ref: "User",
			required: true,
		},
	},
	{ timestamps: true }
);

export const Order = mongoose.model("Order", orderSchema);
