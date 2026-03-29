import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <Card className="w-96">
        <CardHeader>
          <CardTitle>Career Compass</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">Dashboard scaffolded.</p>
          <div className="flex gap-2">
            <Badge>Pipeline</Badge>
            <Badge variant="outline">Career</Badge>
            <Badge variant="secondary">Analytics</Badge>
          </div>
          <Button>Launch</Button>
        </CardContent>
      </Card>
    </div>
  );
}
