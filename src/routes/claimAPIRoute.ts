import express, {Request, Response, NextFunction} from 'express';
import {redirectAsRequiresLogin} from "../middlewares/redirectAsRequiresLogin";
import currency from "currency.js";
import {findExpenseByIdAndUser} from "../services/expenseService";
import {createClaim, deleteClaim, findClaimByIdAndUserId, updateClaim} from "../services/claimService";
import prisma from "../config/db";

import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// noinspection JSUnusedLocalSymbols

router.get('/:claimId', redirectAsRequiresLogin, async(req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).send();
    }

    const claimId = parseInt(req.params.claimId, 10);
    if (isNaN(claimId)) {
        return res.status(404).json({error_message: "Claim not found"});
    }

    const claim = await findClaimByIdAndUserId(claimId, req.user.id)
    console.log(claim);
    if (!claim) {
        return res.status(404).json({error_message: "Claim not found"});
    } else {
        return res.status(200).json(claim);
    }
})

router.post("/:claimId/cancel", redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).send();
    }
    const claimId = req.params.claimId;
    const claimIdActual = parseInt(claimId, 10);
    if (isNaN(claimIdActual)) {
        return res.status(400).json({error_message: "not a valid claimId"});
    }
    const claim = await prisma.claim.findUnique({where: {id: claimIdActual, userId: req.user.id}});
    if (!claim) {
        return res.status(404).json({error_message: `Claim #${claimIdActual} not found.`});
    }
    if (claim.status === "COMPLETED") {
        return res.status(400).json({error_message: `Claim #${claimIdActual} is complete and can't be deleted.`});
    } else {
        const a = await deleteClaim(claim.id);
        if (a) {
            return res.status(200).json({success_message: `Expense #${claimIdActual} deleted.`});
        } else {
            return res.status(404).json({error_message: `Expense #${claimIdActual} not found.`});
        }
    }
})

router.post("/:claimId/edit", redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).send();
    }
    const offsetAmount = Number(req.body.offsetAmount);
    if (isNaN(offsetAmount)) {
        return res.status(404).json({error_message: `Offset amount is not a valid number.`});
    }
    const claimId = parseInt(req.params.claimId, 10);
    if (isNaN(claimId)) {
        return res.status(404).json({error_message: `Claim ${claimId} not found.`});
    }

    const existingClaim = await findClaimByIdAndUserId(claimId, req.user.id)
    if (!existingClaim) {
        return res.status(404).json({error_message: `Claim #${claimId} not found.`});
    }
    if (existingClaim.status === "COMPLETED") {
        return res.status(400).json({error_message: `Claim #${claimId} is complete and can't be deleted.`});
    } else {
        const updatedClaim = await updateClaim(existingClaim.id, offsetAmount);
        if (updatedClaim) {
            return res.status(200).json(updatedClaim);
        } else {
            return res.status(404).json({error_message: `Expense #${claimId} not found.`});
        }
    }
})

router.post('/new', redirectAsRequiresLogin, async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
        return res.status(401).send();
    }

    const {expenses, offsetAmount} = req.body;

    const foundExpenses = [];
    const foundExpensesIds:  number[] = [];

    let expenseTotal = currency(0);

    for (const expenseId of expenses) {
        const actualExpenseId = parseInt(expenseId, 10);
        if (isNaN(actualExpenseId)) {
            return res.status(400).json({error_message: "At least one or more expenses have an invalid ID."});
        }

        let expense = await findExpenseByIdAndUser(actualExpenseId, req.user.id);
        if (!expense) {
            return res.status(400).json({error_message: "At least one or more expenses could not be found while making this claim."});
        }
        if (expense.claimId || expense.claimComplete) {
            return res.status(400).json({error_message: "At least one or more expenses has already been included in a claim."})
        }
        expenseTotal = expenseTotal.add(Number(expense.amount));
        foundExpenses.push(expense);
        foundExpensesIds.push(actualExpenseId);
    }

    if (isNaN(offsetAmount)) {
        return res.status(400).json({ error_message: "Offset amount is invalid." });
    }

    if (offsetAmount > expenseTotal.value) {
        return res.status(400).json({error_message: "Offset amount is more than the total amount of the expenses."});
    }

    const claim = await createClaim(req.user.id, foundExpensesIds, expenseTotal.value, offsetAmount, uuidv4());
    if (claim) {
        return res.status(200).json(claim);
    } else {
        return res.status(500).json({error_message: "Claim might not have been created properly."});
    }
});



export default router;

