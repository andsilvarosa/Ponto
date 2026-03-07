import { calculateDay } from "../../src/utils/timeCalculations";

export async function onRequestPost(context: any) {
  try {
    const { entries, exits, is_holiday, workdayMinutes } = await context.request.json();
    const result = calculateDay(entries, exits, is_holiday, workdayMinutes);
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: "Erro ao calcular ponto", details: error.message }, { status: 500 });
  }
}
