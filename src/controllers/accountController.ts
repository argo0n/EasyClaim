import {Request, Response, NextFunction} from 'express';
import isEmail from 'validator/lib/isEmail';
import {findUserByEmail, registerUser} from "../services/accountService";
import 'express-session';
import bcrypt from 'bcrypt';

function validatePassword(password: string) {
    const validations = {
        length: password.length >= 6 && password.length <= 20,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
    };

    const isValid = Object.values(validations).every(Boolean);
    return isValid;
}

export const LoginUser = async (req: Request, res: Response, next: NextFunction) => {
    if (req.user) {
        return res.status(200).send("You're already logged in mofo");
    }
    if (!req.body.email || !req.body.password) {
        return res.status(400).render('login', {title: 'Login to EasyClaim', login_error: "Your email or password is incorrect.", values: {email: req.body.email}})
    }
    console.log(`Finding user with email ${req.body.email}`)
    const found_user = await findUserByEmail(req.body.email);

    if (!found_user) {
        return res.status(401).render('login', {title: 'Login to EasyClaim', login_error: "Your email or password is incorrect.", values: {email: req.body.email}})
    }

    console.log("Email found.");

    const isValidPassword = await bcrypt.compare(req.body.password, found_user.password);
    console.log(`Password match result: ${isValidPassword}`);
    if (!isValidPassword) {
        return res.status(401).render('login', {title: 'Login to EasyClaim', login_error: "Your email or password is incorrect.", values: {email: req.body.email}})
    }

    req.session.userId = found_user.id;
    return res.status(200).send("You're logged in.");
}

export const FormRegisterUser = async (req: Request, res: Response, next: NextFunction) => {
    console.log("registering user")
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const confirm_password = req.body.confirmpassword;

    let register_error;
    if (!isEmail(email, {allow_display_name: false})) register_error = "Please enter a valid email address.";
    if (confirm_password !== password) register_error = "Passwords do not match.";
    const passwordIsValid = validatePassword(password);
    if (!passwordIsValid) {register_error = "Your password did not meet the security requirements. Please make a stronger password.";}

    if (register_error) {
        return res.render('signup', {title: 'Sign up for EasyClaim', register_error, values: { name, email }});
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
        register_error = `An account with this email already exists. Try <a href="/accounts/login">logging in</a> instead.`
        return res.render('signup', {title: 'Sign up for EasyClaim', register_error, values: { name, email }});
    }

    const user = await registerUser(name, email, password);
    return res.status(200).json(user);
}