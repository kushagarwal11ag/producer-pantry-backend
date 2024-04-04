import Joi from "joi";

const schema = Joi.object({
	name: Joi.string().min(3).max(50),
	email: Joi.string().email(),
	password: Joi.string().min(8).max(30),
	phone: Joi.string()
		.pattern(
			new RegExp(
				"^[+]?[(]?[0-9]{1,4}[)]?[-s.]?[0-9]{1,3}[-s.]?[0-9]{1,4}[-s.]?[0-9]{1,4}[-s.]?[0-9]{1,9}$"
			)
		)
		.message("Invalid phone number format"),
}).or("name", "email", "password", "phone");

export const validateUser = (user) => {
	return schema.validate(user);
};
