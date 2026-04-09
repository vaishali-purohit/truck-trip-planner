from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("trips", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="tripplan",
            name="current_location",
            field=models.CharField(max_length=512),
        ),
        migrations.AlterField(
            model_name="tripplan",
            name="pickup_location",
            field=models.CharField(max_length=512),
        ),
        migrations.AlterField(
            model_name="tripplan",
            name="dropoff_location",
            field=models.CharField(max_length=512),
        ),
    ]

