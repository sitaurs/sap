import ActivityPublic from "../../../components/community/activity-public";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ActivityPublic id={id} />;
}
