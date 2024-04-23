import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const userSchema = new Schema(
	{
		email: {
			type: String,
			required: true,
			trim: true,
			unique: true,
			lowercase: true,
			index: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		password: {
			type: String,
			required: true,
		},
		role: {
			type: String,
			enum: ["farmer", "retailer"],
			required: true,
		},
		avatar: {
			id: {
				type: String,
			},
			url: {
				type: String,
			},
		},
		govId: {
			id: {
				type: String,
			},
			url: {
				type: String,
			},
		},
		certification: {
			id: {
				type: String,
			},
			url: {
				type: String,
			},
		},
		address: {
			type: String,
		},
		phone: {
			type: String,
		},
		cart: [
			{
				crop: {
					type: Schema.Types.ObjectId,
					ref: "Crop",
				},
				quantity: {
					type: Number,
					default: 1,
					min: 1,
					max: 5,
				},
			},
		],
		refreshToken: {
			type: String,
		},
		/*
		wishlist: [
			{
				type: Schema.Types.ObjectId,
				ref: "Crop",
			},
		],
		*/
	},
	{ timestamps: true }
);

userSchema.pre("save", async function (next) {
	if (!this.isModified("password")) return next();
	this.password = await bcrypt.hash(this.password, 10);
	next();
});

userSchema.methods.isPasswordCorrect = async function (password) {
	return await bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
	return jwt.sign(
		{
			_id: this._id,
			email: this.email,
			name: this.name,
		},
		process.env.ACCESS_TOKEN_SECRET,
		{
			expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
		}
	);
};

userSchema.methods.generateRefreshToken = function () {
	return jwt.sign(
		{
			_id: this._id,
		},
		process.env.REFRESH_TOKEN_SECRET,
		{
			expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
		}
	);
};

export const User = mongoose.model("User", userSchema);
