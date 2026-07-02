import { requireSessionUserId } from "@/auth/access";
import {
  createStore,
  listStores,
  resolveCurrentStore,
  setCurrentStore,
  storeCreateRequestSchema,
} from "@/services/stores";

import {
  unauthorizedResponse,
  validationErrorResponse,
} from "../_lib/responses";

export async function GET() {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  try {
    const [stores, currentStore] = await Promise.all([
      listStores(),
      resolveCurrentStore(userId),
    ]);

    return Response.json({ stores, currentStoreId: currentStore?.id ?? null });
  } catch {
    return Response.json(
      { error: "Stores could not be loaded. Try again." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const userId = await requireSessionUserId();

  if (!userId) {
    return unauthorizedResponse();
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send a JSON store." }, { status: 400 });
  }

  const parsed = storeCreateRequestSchema.safeParse(body);

  if (!parsed.success) {
    return validationErrorResponse(
      parsed.error,
      "Check the highlighted store fields.",
    );
  }

  try {
    const store = await createStore(parsed.data.name);
    // A new store is almost always created to be set up next, so make it
    // the creator's current store right away.
    await setCurrentStore(userId, store.id);

    return Response.json({ store });
  } catch {
    return Response.json(
      { error: "The store could not be created. Try again." },
      { status: 500 },
    );
  }
}
