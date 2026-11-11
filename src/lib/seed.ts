import { createCircle } from "./engine";

export const DEMO_DESCRIPTION =
  "Call it Anna Nagar Friends Circle. Six of us: Priya, Ravi, Meena, Arjun, Lakshmi and Karthik. $50 a month each starting next month, winner picked by lottery.";

export async function seedDemo() {
  return createCircle(DEMO_DESCRIPTION);
}
