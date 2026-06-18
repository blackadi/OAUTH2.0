import { Router } from "express";
import { userinfoController } from "../controllers/userinfo.controller";
import { userinfoIssueController } from "../controllers/userinfo-issue.controller";

const router = Router();

router.post("/userinfo", userinfoController.handleUserInfo);
router.get("/userinfo", userinfoController.handleUserInfo);
router.post("/userinfo/issue", userinfoIssueController.handleIssue);



export default router;
