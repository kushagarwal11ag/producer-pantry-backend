import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import ApiError from "./utils/ApiError.js";

const app = express();

app.use(
	cors({
		origin: process.env.CORS_ORIGIN,
		credentials: true,
	})
);

app.use(express.json({ limit: "16kb" }));

app.use(express.urlencoded({ extended: true, limit: "16kb" }));

app.use(express.static("public"));

app.use(cookieParser());

// routes import
import userRouter from "./routes/user.routes.js";
import cropRouter from "./routes/crop.routes.js";

// routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/crops", cropRouter);

app.use((err, req, res, next) => {
	if (err instanceof ApiError) {
		// Custom ApiError handling
		res.status(err.statusCode).json({
			success: false,
			message: err.message,
			errors: err.errors, // Optional, if you're using the errors array
		});
	} else {
		// Generic error handling
		res.status(500).json({
			success: false,
			message: "Internal Server Error",
		});
	}
});

export default app;
