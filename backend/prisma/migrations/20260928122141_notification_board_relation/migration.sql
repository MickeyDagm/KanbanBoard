-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
