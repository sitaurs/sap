import CoordinatorPage from "../../../../components/community/coordinator-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CoordinatorPage id={id} />;
}
