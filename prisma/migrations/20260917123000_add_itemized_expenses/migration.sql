ALTER TYPE "SplitMode" ADD VALUE 'ITEMIZED';

CREATE TABLE "ExpenseItem" (
  "id" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  CONSTRAINT "ExpenseItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExpenseItemAssignee" (
  "itemId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  CONSTRAINT "ExpenseItemAssignee_pkey" PRIMARY KEY ("itemId", "participantId")
);
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "ExpenseItem_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseItemAssignee" ADD CONSTRAINT "ExpenseItemAssignee_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExpenseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExpenseItemAssignee" ADD CONSTRAINT "ExpenseItemAssignee_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "ExpenseItem_expenseId_displayOrder_idx" ON "ExpenseItem"("expenseId", "displayOrder");
