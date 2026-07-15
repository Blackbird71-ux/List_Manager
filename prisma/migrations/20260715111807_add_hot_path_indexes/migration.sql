-- CreateIndex
CREATE INDEX "Attachment_itemId_idx" ON "Attachment"("itemId");

-- CreateIndex
CREATE INDEX "Checklist_organizationId_status_idx" ON "Checklist"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Checklist_assignedToId_idx" ON "Checklist"("assignedToId");

-- CreateIndex
CREATE INDEX "Checklist_createdById_idx" ON "Checklist"("createdById");

-- CreateIndex
CREATE INDEX "Checklist_templateId_idx" ON "Checklist"("templateId");

-- CreateIndex
CREATE INDEX "ChecklistDepartment_departmentId_idx" ON "ChecklistDepartment"("departmentId");

-- CreateIndex
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");

-- CreateIndex
CREATE INDEX "ChecklistItem_assignedToId_idx" ON "ChecklistItem"("assignedToId");

-- CreateIndex
CREATE INDEX "ChecklistShare_userId_idx" ON "ChecklistShare"("userId");

-- CreateIndex
CREATE INDEX "CustomFieldDef_templateId_idx" ON "CustomFieldDef"("templateId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_checklistId_idx" ON "CustomFieldValue"("checklistId");

-- CreateIndex
CREATE INDEX "DepartmentMember_userId_idx" ON "DepartmentMember"("userId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "Template_organizationId_idx" ON "Template"("organizationId");

-- CreateIndex
CREATE INDEX "TemplateItem_templateId_idx" ON "TemplateItem"("templateId");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");
