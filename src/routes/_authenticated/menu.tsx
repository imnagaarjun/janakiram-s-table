import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RoleGuard } from "@/components/RoleGuard";
import { CategoriesPanel } from "@/components/menu/CategoriesPanel";
import { ItemsPanel } from "@/components/menu/ItemsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/menu")({ component: Page });

function Page() {
  return (
    <RoleGuard allow={["admin", "manager"]}>
      <MenuInner />
    </RoleGuard>
  );
}

function MenuInner() {
  const [tab, setTab] = useState("items");
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Menu</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="items" className="mt-0">
          <ItemsPanel />
        </TabsContent>
        <TabsContent value="categories" className="mt-0">
          <CategoriesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
