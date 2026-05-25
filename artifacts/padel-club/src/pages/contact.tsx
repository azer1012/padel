import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

export default function Contact() {
  return (
    <div className="min-h-screen bg-background text-foreground py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-12">
        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black uppercase italic text-primary">Contact Us</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Get in touch with our team for any inquiries or support.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-bold uppercase">Club Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin className="w-6 h-6 text-primary mt-1" />
                <div>
                  <h3 className="font-bold">Address</h3>
                  <p className="text-muted-foreground">Les Berges du Lac<br/>Tunis, 1053<br/>Tunisia</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Phone className="w-6 h-6 text-primary mt-1" />
                <div>
                  <h3 className="font-bold">Phone</h3>
                  <p className="text-muted-foreground">+216 71 123 456</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className="w-6 h-6 text-primary mt-1" />
                <div>
                  <h3 className="font-bold">Email</h3>
                  <p className="text-muted-foreground">contact@padelclub.tn</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Clock className="w-6 h-6 text-primary mt-1" />
                <div>
                  <h3 className="font-bold">Opening Hours</h3>
                  <p className="text-muted-foreground">Every day: 06:00 - 00:00</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-2xl font-bold uppercase">Location</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted rounded-lg flex items-center justify-center border border-border">
                <p className="text-muted-foreground">Map Integration</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}