from django.db import migrations, models


def backfill_trip_no(apps, schema_editor):
    TripPlan = apps.get_model("trips", "TripPlan")
    qs = TripPlan.objects.order_by("created_at", "id")
    n = 1900
    for t in qs:
        if getattr(t, "trip_no", None) is None:
            t.trip_no = n
            t.save(update_fields=["trip_no"])
            n += 1
        else:
            n = max(n, int(t.trip_no) + 1)


class Migration(migrations.Migration):
    dependencies = [
        ("trips", "0002_alter_tripplan_location_lengths"),
    ]

    operations = [
        migrations.AddField(
            model_name="tripplan",
            name="trip_no",
            field=models.BigIntegerField(blank=True, editable=False, null=True, unique=True),
        ),
        migrations.RunPython(backfill_trip_no, migrations.RunPython.noop),
    ]

