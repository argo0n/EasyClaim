import express, {Request, Response, NextFunction} from 'express';
import {redirectAsRequiresLogin} from "../middlewares/redirectAsRequiresLogin";
import prisma from "../config/db";
import currency from "currency.js";
import pug from "pug";
import {Decimal} from "@prisma/client/runtime/library";
import {deleteUser, processEmailUpdate, processPasswordUpdate, processProfileUpdate} from "../services/accountService";
import bcrypt from "bcrypt";
import {insertAccountDeleted, insertProfileUpdated} from "../services/auditLogService";
import {SessionManager} from "../utils/sessionManager";
import config from "../config/configLoader";
import {OAuthProviderConfig} from "../config/config.types";

const router = express.Router();
const sessionManager = new SessionManager();

router.get('/', redirectAsRequiresLogin, (req: Request, res: Response, next: NextFunction) => {
    return res.render('pages/settings/settings', {section: 'profile'});
});

router.get('/:section', redirectAsRequiresLogin, (req: Request, res: Response, next: NextFunction) => {
    if (['profile', 'account', 'connections'].includes(req.params.section)) {
        const clients: OAuthProviderConfig[] = Object.keys(config.app.oauth)
            .filter((key: string) => key !== "default")
            .map(key => (config.app.oauth as Record<string, OAuthProviderConfig>)[key]);
        const OAuthFlashMessages = req.flash('settings_unlink_oauth') as unknown as string[];
        let alerts: {
            profile: { tpe: string; content: string }[];
            account: { tpe: string; content: string }[];
            connections: { tpe: string; content: string }[]
        } = {profile: [], account: [], connections: []};
        for (const flashMsg of OAuthFlashMessages) {
            const splitMsg = flashMsg.split(":");
            const flashAlert = { tpe: splitMsg[0], content: splitMsg.slice(1).join(":") };
            alerts.connections.push(flashAlert);
        }
        return res.render('pages/settings/settings', {section: req.params.section, possibleClients: clients, alerts: alerts});
    } else {
        next();
    }
})

router.post('/profile', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).send();
    }
    const { error, success } = await processProfileUpdate(req.user.id, req.body.name);
    if (error) {
        return res.status(400).render('pages/settings/settings', {section: 'profile', error: error})
    }
    if (success) {
        req.user = success;
        res.locals.user = success;
        return res.render('pages/settings/settings', {section: 'profile', success: "Profile updated successfully!"});
    }
    return res.status(500).render('pages/errors/500');
})

router.post('/account/email', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return res.status(401).send();}
    const { error, success } = await processEmailUpdate(req.user.id, req.body.email);
    const changedFields: Record<string, { old: any; new: any }> = {};
    if (req.user.email !== req.body.email) { changedFields.email = { old: req.user.email, new: req.body.email }; }

    if (error) {
        return res.status(400).render('pages/settings/settings', {section: 'account', error: error})
    }
    if (success) {
        req.user = success;
        res.locals.user = success;
        await insertProfileUpdated(req.user.id, changedFields, req);
        return res.render('pages/settings/settings', {section: 'account', success: "Your email has been updated."});
    }
    return res.status(500).render('pages/errors/500');
})

router.get('/account/delete', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return res.status(401).send();}
    return res.render('pages/settings/confirmaccountdeletion', {section: 'account', success: "Your email has been updated."});
})

router.post('/account/delete', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { return res.status(401).send();}
    const user_password = req.body.password;
    if (!user_password) {
        return res.status(400).render('pages/settings/confirmaccountdeletion', {error: "You must enter your account's password to delete your account."})
    }
    const isValidPassword = req.user.password ? await bcrypt.compare(user_password, req.user.password) : false;
    if (!isValidPassword) {
        return res.status(401).render('pages/settings/confirmaccountdeletion', {error: "Your password is incorrect."});
    }
    try {
        const result = await deleteUser(req.user.id);
        if (result) {
            await insertAccountDeleted(req.user.id, "user", "user_initiated", req);
            return res.status(200).render('pages/settings/accountdeleted');
        } else {
            return res.status(500).render('pages/settings/accountdeleted', {error: "An error occured while trying to delete your account. Please try again later."});
        }
    } catch (e) {
        console.error("Error occured while deleting user:", e);
        return res.status(500).render('pages/settings/confirmaccountdeletion', {error: "An error occured while trying to delete your account. Please try again later."})
    }



})

router.post('/account/password', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    console.log(req.body);
    if (!req.user) { return res.status(401).send();}
    const { error, success } = await processPasswordUpdate(req.user.id, req.body.old_password, req.body.password, req.body.confirmpassword);

    if (error) {
        return res.status(400).render('pages/settings/settings', {section: 'account', error: error})
    }
    if (success) {
        await sessionManager.deleteSessionsByUserIdExceptSessionId(req.user.id, req.sessionID);
        req.user = success;
        res.locals.user = success;
        return res.render('pages/settings/settings', {section: 'account', success: "Your password has been updated."});
    }
    return res.status(500).render('pages/errors/500');
})

export default router;
