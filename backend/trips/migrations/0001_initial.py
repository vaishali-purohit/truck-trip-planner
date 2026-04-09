import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name="TripPlan",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("current_location", models.CharField(max_length=160)),
                ("pickup_location", models.CharField(max_length=160)),
                ("dropoff_location", models.CharField(max_length=160)),
                ("cycle_hours_used", models.FloatField(default=0)),
                ("result", models.JSONField(default=dict)),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
    ]
