import React from "react";
import { MinigamesModal } from "../minigames";

/**
 * Backwards-compatibility wrapper for CaptchaModal.
 * Forwards all props to the new MinigamesModal system.
 */
export function CaptchaModal(props) {
  return <MinigamesModal initialGame="captcha" {...props} />;
}
